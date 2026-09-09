import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ModeleEquipementCsvRowOk,
} from '../csv-import'
import {
  useCreateModeleEquipement,
  useUpdateModeleSpecifications,
} from '../mutations'
import type { ModeleEquipement } from '../queries'
import { parseChamps } from '@/lib/champs'
import { writeErrorMessage } from '@/lib/form'
import {
  CsvImportDialog,
  type CsvImportLigne,
} from '@/components/common/csv-import-dialog'

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Catégorie CIBLE : elle donne le rangement ET le périmètre des modèles créés. */
  categorie: { id: string; nom: string; site_id: string | null }
  /** Modèles DÉJÀ dans cette catégorie : complétés plutôt que dupliqués. */
  existants: ModeleEquipement[]
}

/**
 * Import en masse de modèles d'équipements (gabarits) et de leurs
 * caractéristiques via un CSV généré par une IA générative externe (coquille
 * commune `CsvImportDialog`). Une ligne = une caractéristique, le modèle
 * répété sur ses lignes. Un modèle déjà présent est COMPLÉTÉ (ses
 * caractéristiques existantes ne sont jamais réécrites), jamais dupliqué —
 * décision PO. L'écriture emprunte les mêmes mutations que les formulaires
 * manuels.
 */
export function ImportCsvDialog({
  open,
  onOpenChange,
  categorie,
  existants,
}: ImportCsvDialogProps) {
  const [csvTexte, setCsvTexte] = useState('')
  const [importing, setImporting] = useState(false)
  const create = useCreateModeleEquipement()
  const completer = useUpdateModeleSpecifications()

  const existantsPourImport = useMemo(
    () =>
      existants.map((m) => ({
        id: m.id,
        nom: m.nom,
        champs: parseChamps(m.specifications),
      })),
    [existants],
  )

  const prompt = useMemo(
    () =>
      buildImportPrompt({
        categorieNom: categorie.nom,
        existants: existantsPourImport,
      }),
    [categorie.nom, existantsPourImport],
  )

  const resultat = useMemo(
    () => parseImportCsv(csvTexte, existantsPourImport),
    [csvTexte, existantsPourImport],
  )
  const lignesValides = resultat.lignes.filter(
    (l): l is ModeleEquipementCsvRowOk => l.ok,
  )
  const plan = useMemo(
    () => construirePlan(lignesValides, existantsPourImport),
    [lignesValides, existantsPourImport],
  )
  const lignesApercu: CsvImportLigne[] = resultat.lignes.map((l) =>
    l.ok
      ? {
          ligne: l.ligne,
          ok: true,
          texte: l.champ
            ? `${l.modele} → ${l.champ.cle}`
            : `${l.modele} (sans caractéristique)`,
        }
      : {
          ligne: l.ligne,
          ok: false,
          texte: l.erreurs.join(' '),
          ignoree: l.ignoree,
        },
  )

  function reinitialiser() {
    setCsvTexte('')
    setImporting(false)
  }

  async function confirmerImport() {
    if (plan.modeles.length === 0) return
    setImporting(true)
    // Portée héritée de la catégorie d'accueil, comme à la création manuelle :
    // catégorie commune → modèle commun ; catégorie de site → modèle du site.
    const portee = categorie.site_id === null ? 'entreprise' : 'site'
    const resultats = await Promise.allSettled(
      plan.modeles.map((m) =>
        m.existantId === null
          ? create.mutateAsync({
              values: {
                nom: m.nom,
                description: m.description ?? '',
                categorie_id: categorie.id,
                portee,
                etat: 'actif',
                miniature_id: null,
                specifications: m.champsAjoutes,
              },
              siteId: categorie.site_id,
            })
          : // Modèle existant : on RAJOUTE les caractéristiques apportées après
            // celles déjà en base, sans toucher au reste de la fiche.
            completer.mutateAsync({
              id: m.existantId,
              champs: [...m.champsExistants, ...m.champsAjoutes],
            }),
      ),
    )
    setImporting(false)
    const echecs = resultats.filter((r) => r.status === 'rejected')
    if (echecs.length === 0) {
      toast.success(
        `${String(plan.modeles.length)} modèle${plan.modeles.length > 1 ? 's' : ''} importé${plan.modeles.length > 1 ? 's' : ''}`,
      )
      onOpenChange(false)
      reinitialiser()
      return
    }
    const premiere = echecs[0]
    const detail =
      premiere?.status === 'rejected' ? writeErrorMessage(premiere.reason) : ''
    toast.error(
      `${String(plan.modeles.length - echecs.length)} importé(s), ${String(echecs.length)} échec(s) — ${detail}`,
    )
  }

  const resume = resumePlan(plan)
  const nbAEcrire = plan.nbCreations + plan.nbCompletions

  return (
    <CsvImportDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reinitialiser()
      }}
      title="Importer des modèles d’équipements via CSV"
      description={`Catégorie « ${categorie.nom} ».`}
      prompt={prompt}
      csvTexte={csvTexte}
      onCsvTexteChange={setCsvTexte}
      colonnesManquantes={resultat.colonnesManquantes}
      lignes={lignesApercu}
      resume={resume || undefined}
      importLabel={`Importer ${String(nbAEcrire)} modèle${nbAEcrire > 1 ? 's' : ''}`}
      importing={importing}
      onImport={() => void confirmerImport()}
    />
  )
}
