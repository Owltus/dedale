import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type GammeCsvRowOk,
  type GammeExistante,
} from '../csv-import'
import { gammesQueries, referentielsQueries } from '../queries'
import { useCreateGammeBiblio, useCreateOperation } from '../mutations'
import { resumeOperation } from '@/features/operations/csv-import'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import {
  CsvImportDialog,
  type CsvImportLigne,
} from '@/components/common/csv-import-dialog'

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sous-catégorie CIBLE (niveau 2) : toute gamme y est rangée. */
  sousCategorie: { id: string; nom: string }
  /** Gammes DÉJÀ dans cette sous-catégorie : complétées plutôt que dupliquées. */
  existants: { id: string; nom: string }[]
}

/**
 * Import en masse de gammes (plan de maintenance) et de leurs opérations via
 * un CSV généré par une IA générative externe (coquille commune
 * `CsvImportDialog`). Une ligne = une opération, la gamme répétée sur ses
 * lignes ; une gamme sans opération détaillée tient sur une ligne. Une gamme
 * déjà présente est COMPLÉTÉE de ses opérations manquantes — sa nature et sa
 * périodicité ne sont jamais modifiées. Les valeurs autorisées (nature,
 * périodicité, type d'opération, unité) sont énumérées dans le prompt : l'IA
 * n'a rien à inventer.
 *
 * La Bibliothèque de gammes est COMMUNE à l'entreprise (`site_id NULL`) : les
 * gammes créées ici sont des templates, sans prestataire (il est renseigné à la
 * copie vers un site).
 */
export function ImportCsvDialog({
  open,
  onOpenChange,
  sousCategorie,
  existants,
}: ImportCsvDialogProps) {
  const [csvTexte, setCsvTexte] = useState('')
  const [importing, setImporting] = useState(false)
  const { session } = useAuth()
  const createGamme = useCreateGammeBiblio()
  const createOperation = useCreateOperation()

  const { data: types = [] } = useQuery(referentielsQueries.typesOperations())
  const { data: unites = [] } = useQuery(referentielsQueries.unites())
  const { data: periodicites = [] } = useQuery(
    referentielsQueries.periodicites(),
  )
  const refs = useMemo(() => ({ types, unites }), [types, unites])

  const { data: operations = [] } = useQuery(
    gammesQueries.operationsDesGammes(existants.map((g) => g.id)),
  )
  const existantsPourImport = useMemo<GammeExistante[]>(
    () =>
      existants.map((g) => ({
        id: g.id,
        nom: g.nom,
        operations: operations
          .filter((o) => o.gamme_id === g.id)
          .map((o) => o.nom),
      })),
    [existants, operations],
  )

  const prompt = useMemo(
    () =>
      buildImportPrompt({
        sousCategorieNom: sousCategorie.nom,
        refs,
        periodicites,
        existants: existantsPourImport,
      }),
    [sousCategorie.nom, refs, periodicites, existantsPourImport],
  )

  const resultat = useMemo(
    () => parseImportCsv(csvTexte, refs, periodicites, existantsPourImport),
    [csvTexte, refs, periodicites, existantsPourImport],
  )
  const lignesValides = resultat.lignes.filter((l): l is GammeCsvRowOk => l.ok)
  const plan = useMemo(
    () => construirePlan(lignesValides, existantsPourImport),
    [lignesValides, existantsPourImport],
  )
  const lignesApercu: CsvImportLigne[] = resultat.lignes.map((l) =>
    l.ok
      ? {
          ligne: l.ligne,
          ok: true,
          texte: l.operation
            ? `${l.gamme} → ${resumeOperation(l.operation, refs)}`
            : `${l.gamme} (sans opération)`,
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
    if (plan.gammes.length === 0 || !session) return
    setImporting(true)
    const resultats = await Promise.allSettled(
      plan.gammes.map(async (g) => {
        let gammeId = g.existantId
        if (gammeId === null) {
          // Nature et périodicité sont garanties par le parseur pour une gamme
          // NOUVELLE (elles sont exigées sur sa première ligne).
          const creee = await createGamme.mutateAsync({
            siteId: null,
            createdBy: session.user.id,
            values: {
              nom: g.nom,
              nature: g.nature ?? 'maintenance_preventive',
              periodicite_id: String(g.periodiciteId ?? ''),
              // Template commun : pas de prestataire (renseigné à la copie).
              prestataire_id: '',
              categorie_id: sousCategorie.id,
              description: g.description ?? '',
              miniature_id: null,
              portee: 'entreprise',
            },
          })
          gammeId = creee.id
        }
        for (const op of g.operations) {
          await createOperation.mutateAsync({
            gammeId,
            values: op.values,
            aUnite: op.aUnite,
            requiresSeuils: op.requiresSeuils,
          })
        }
      }),
    )
    setImporting(false)
    const echecs = resultats.filter((r) => r.status === 'rejected')
    if (echecs.length === 0) {
      toast.success(
        `${String(plan.gammes.length)} gamme${plan.gammes.length > 1 ? 's' : ''} importée${plan.gammes.length > 1 ? 's' : ''} (${String(plan.nbOperations)} opération${plan.nbOperations > 1 ? 's' : ''})`,
      )
      onOpenChange(false)
      reinitialiser()
      return
    }
    const premiere = echecs[0]
    const detail =
      premiere?.status === 'rejected' ? writeErrorMessage(premiere.reason) : ''
    toast.error(
      `${String(plan.gammes.length - echecs.length)} importée(s), ${String(echecs.length)} échec(s) — ${detail}`,
    )
  }

  const resume = resumePlan(plan)
  const nbAEcrire = plan.gammes.length

  return (
    <CsvImportDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reinitialiser()
      }}
      title="Importer un plan de maintenance via CSV"
      description={`Sous-catégorie « ${sousCategorie.nom} ».`}
      prompt={prompt}
      csvTexte={csvTexte}
      onCsvTexteChange={setCsvTexte}
      colonnesManquantes={resultat.colonnesManquantes}
      lignes={lignesApercu}
      resume={resume || undefined}
      importLabel={`Importer ${String(nbAEcrire)} gamme${nbAEcrire > 1 ? 's' : ''}`}
      importing={importing}
      onImport={() => void confirmerImport()}
    />
  )
}
