import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ModeleOperationCsvRowOk,
  type ModeleOperationExistant,
} from '../csv-import'
import { modelesOperationsQueries, type ModeleOperation } from '../queries'
import { useCreateModeleOperation, useCreateOperationItem } from '../mutations'
import { referentielsQueries } from '@/features/gammes/queries'
import { resumeOperation } from '@/features/operations/csv-import'
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
  existants: ModeleOperation[]
}

/**
 * Import en masse de modèles d'opérations et de leurs opérations types via un
 * CSV généré par une IA générative externe (coquille commune
 * `CsvImportDialog`). Une ligne = une opération, le modèle répété sur ses
 * lignes. Un modèle déjà présent est COMPLÉTÉ de ses opérations manquantes,
 * jamais dupliqué — décision PO. Les valeurs autorisées (types d'opération,
 * unités) viennent des référentiels et sont énumérées dans le prompt, si bien
 * que l'IA n'a rien à inventer.
 */
export function ImportCsvDialog({
  open,
  onOpenChange,
  categorie,
  existants,
}: ImportCsvDialogProps) {
  const [csvTexte, setCsvTexte] = useState('')
  const [importing, setImporting] = useState(false)
  const createModele = useCreateModeleOperation()
  const createItem = useCreateOperationItem()

  const { data: types = [] } = useQuery(referentielsQueries.typesOperations())
  const { data: unites = [] } = useQuery(referentielsQueries.unites())
  const refs = useMemo(() => ({ types, unites }), [types, unites])

  // Opérations déjà en place dans les modèles de la catégorie : le prompt les
  // annonce à l'IA, et le parseur s'en sert pour ne pas les recréer.
  const { data: items = [] } = useQuery(
    modelesOperationsQueries.itemsDesModeles(existants.map((m) => m.id)),
  )
  const existantsPourImport = useMemo<ModeleOperationExistant[]>(
    () =>
      existants.map((m) => ({
        id: m.id,
        nom: m.nom,
        operations: items
          .filter((i) => i.modele_operation_id === m.id)
          .map((i) => i.nom),
      })),
    [existants, items],
  )

  const prompt = useMemo(
    () =>
      buildImportPrompt({
        categorieNom: categorie.nom,
        refs,
        existants: existantsPourImport,
      }),
    [categorie.nom, refs, existantsPourImport],
  )

  const resultat = useMemo(
    () => parseImportCsv(csvTexte, refs, existantsPourImport),
    [csvTexte, refs, existantsPourImport],
  )
  const lignesValides = resultat.lignes.filter(
    (l): l is ModeleOperationCsvRowOk => l.ok,
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
          texte: `${l.modele} → ${resumeOperation(l.operation, refs)}`,
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
    // Portée héritée de la catégorie d'accueil, comme à la création manuelle.
    const portee = categorie.site_id === null ? 'entreprise' : 'site'
    // Modèle puis ses opérations : l'ordre compte (le modèle porte la clé
    // étrangère des items). Les modèles restent parallèles entre eux.
    const resultats = await Promise.allSettled(
      plan.modeles.map(async (m) => {
        let modeleId = m.existantId
        if (modeleId === null) {
          const cree = await createModele.mutateAsync({
            values: {
              nom: m.nom,
              description: m.description ?? '',
              categorie_id: categorie.id,
              miniature_id: null,
              portee,
            },
            siteId: categorie.site_id,
          })
          modeleId = cree.id
        }
        for (const op of m.operations) {
          await createItem.mutateAsync({
            modeleId,
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
        `${String(plan.modeles.length)} modèle${plan.modeles.length > 1 ? 's' : ''} importé${plan.modeles.length > 1 ? 's' : ''} (${String(plan.nbOperations)} opération${plan.nbOperations > 1 ? 's' : ''})`,
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
  const nbAEcrire = plan.modeles.length

  return (
    <CsvImportDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reinitialiser()
      }}
      title="Importer des modèles d’opérations via CSV"
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
