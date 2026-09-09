import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { localisationsQueries } from '../queries'
import {
  useCreateBatiment,
  useCreateLocal,
  useCreateNiveau,
} from '../mutations'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ArbreExistant,
  type ContexteImport,
  type CsvImportRowOk,
  type PlanImport,
} from '../csv-import'
import { writeErrorMessage } from '@/lib/form'
import { parseChamps, serializeChamps } from '@/lib/champs'
import {
  CsvImportDialog,
  type CsvImportLigne,
} from '@/components/common/csv-import-dialog'

const ARBRE_VIDE: ArbreExistant = { batiments: [], niveaux: [], locaux: [] }

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Palier ouvert : bâtiment (et niveau) d'où l'import est lancé. */
  batiment: { id: string; nom: string } | null
  niveau: { id: string; nom: string } | null
}

/**
 * Import en masse de l'arborescence des lieux (bâtiments → niveaux → locaux)
 * via un CSV généré par une IA générative externe (coquille commune
 * `CsvImportDialog`). Chaque ligne est résolue contre l'arbre existant, puis
 * les créations sont regroupées en plan et exécutées parent → enfant par les
 * MÊMES mutations que la création manuelle (front présente, la base valide).
 */
export function ImportCsvDialog({
  open,
  onOpenChange,
  siteId,
  batiment,
  niveau,
}: ImportCsvDialogProps) {
  const [csvTexte, setCsvTexte] = useState('')
  const [importing, setImporting] = useState(false)
  const createBatiment = useCreateBatiment()
  const createNiveau = useCreateNiveau()
  const createLocal = useCreateLocal()
  const { data: arbre = ARBRE_VIDE } = useQuery(
    localisationsQueries.arbre(open ? siteId : null),
  )
  const { data: typesBruts = [] } = useQuery(localisationsQueries.typesLocaux())
  // Chaque type porte son gabarit de caractéristiques (112) : le prompt en
  // décrit les colonnes et le parseur valide chaque ligne sur le gabarit de
  // SON type.
  const types = useMemo(
    () =>
      typesBruts.map((t) => ({
        id: t.id,
        libelle: t.libelle,
        champs: parseChamps(t.specifications),
      })),
    [typesBruts],
  )

  const contexte = useMemo<ContexteImport>(
    () => ({
      batiment: batiment ? { id: batiment.id, nom: batiment.nom } : null,
      niveau: niveau ? { id: niveau.id, nom: niveau.nom } : null,
    }),
    [batiment, niveau],
  )
  const prompt = useMemo(
    () => buildImportPrompt({ arbre, types, contexte }),
    [arbre, types, contexte],
  )
  const resultat = useMemo(
    () => parseImportCsv(csvTexte, arbre, types, contexte),
    [csvTexte, arbre, types, contexte],
  )
  const lignesValides = useMemo(
    () => resultat.lignes.filter((l): l is CsvImportRowOk => l.ok),
    [resultat],
  )
  const plan = useMemo(
    () => construirePlan(lignesValides, arbre),
    [lignesValides, arbre],
  )
  const lignesApercu: CsvImportLigne[] = resultat.lignes.map((l) =>
    l.ok
      ? { ligne: l.ligne, ok: true, texte: l.chemin }
      : { ligne: l.ligne, ok: false, texte: l.erreurs.join(' ') },
  )
  const nbErreurs = resultat.lignes.length - lignesValides.length
  const resume = resumePlan(plan)

  function reinitialiser() {
    setCsvTexte('')
    setImporting(false)
  }

  /** Exécute le plan parent → enfant ; compte les créations et les échecs. */
  async function executer(p: PlanImport) {
    let crees = 0
    let echecs = 0
    let premiereErreur: unknown
    const noter = (e: unknown, poids: number) => {
      echecs += poids
      premiereErreur ??= e
    }
    for (const b of p.batiments) {
      let batimentId = b.existantId
      if (batimentId === null) {
        try {
          const cree = await createBatiment.mutateAsync({
            siteId,
            values: {
              nom: b.nom,
              description: b.description ?? '',
              miniature_id: null,
            },
          })
          batimentId = cree.id
          crees += 1
        } catch (e) {
          // Sans bâtiment, tout ce qu'il contenait tombe avec lui.
          noter(
            e,
            1 + b.niveaux.reduce((acc, n) => acc + 1 + n.locaux.length, 0),
          )
          continue
        }
      }
      for (const n of b.niveaux) {
        let niveauId = n.existantId
        if (niveauId === null) {
          try {
            const cree = await createNiveau.mutateAsync({
              batimentId,
              values: {
                nom: n.nom,
                description: n.description ?? '',
                ordre: n.ordre,
                miniature_id: null,
              },
            })
            niveauId = cree.id
            crees += 1
          } catch (e) {
            noter(e, 1 + n.locaux.length)
            continue
          }
        }
        const idNiveau = niveauId
        const resultats = await Promise.allSettled(
          n.locaux.map((l) =>
            createLocal.mutateAsync({
              niveauId: idNiveau,
              values: {
                nom: l.nom,
                description: l.description ?? '',
                surface_m2: l.surface,
                type_local_id: l.typeLocalId,
                miniature_id: null,
                chauffe_climatise: l.chauffe,
                hauteur_m: l.hauteur,
                capacite_personnes: l.capacite,
                accessible_pmr: l.pmr,
              },
              specifications: serializeChamps(l.champs),
            }),
          ),
        )
        for (const r of resultats) {
          if (r.status === 'fulfilled') crees += 1
          else noter(r.reason, 1)
        }
      }
    }
    return { crees, echecs, premiereErreur }
  }

  async function confirmerImport() {
    if (lignesValides.length === 0) return
    setImporting(true)
    const { crees, echecs, premiereErreur } = await executer(plan)
    setImporting(false)
    if (echecs === 0) {
      toast.success(`${resume} créé${crees > 1 ? 's' : ''}`)
      onOpenChange(false)
      reinitialiser()
    } else {
      toast.error(
        `${String(crees)} créé(s), ${String(echecs)} échec(s) — ${writeErrorMessage(premiereErreur)}`,
      )
    }
  }

  return (
    <CsvImportDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reinitialiser()
      }}
      title="Importer des localisations via CSV"
      description={
        niveau && batiment
          ? `Locaux du niveau « ${niveau.nom} » (${batiment.nom}).`
          : batiment
            ? `Niveaux et locaux du bâtiment « ${batiment.nom} ».`
            : 'Bâtiments, niveaux et locaux du site.'
      }
      prompt={prompt}
      csvTexte={csvTexte}
      onCsvTexteChange={setCsvTexte}
      colonnesManquantes={resultat.colonnesManquantes}
      lignes={lignesApercu}
      resume={
        resume !== '' ? (
          <>
            À créer : {resume}
            {nbErreurs > 0 &&
              ` · ${String(nbErreurs)} ligne${nbErreurs > 1 ? 's' : ''} en erreur`}
          </>
        ) : undefined
      }
      importLabel={resume !== '' ? `Importer ${resume}` : 'Importer'}
      importing={importing}
      onImport={() => void confirmerImport()}
    />
  )
}
