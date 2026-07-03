import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLierModelesOperation } from '../mutations'
import { modelesOperationsQueries } from '@/features/modeles-operations/queries'
import { writeErrorMessage } from '@/lib/form'
import { ChecklistDialog } from '@/components/common/checklist-dialog'
import { ErrorState } from '@/components/common/error-state'
import { Badge } from '@/components/ui/badge'

interface ImportModeleOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gammeId: string
  /** Portée de la gamme : `null` = commune, sinon l'id du site. */
  gammeSiteId: string | null
  /** Ids des modèles déjà liés (exclus de la liste pour éviter le double-import). */
  liesIds: string[]
}

/**
 * Libellés d'erreur pour une liaison refusée (pas de mur d'erreur brut). L'INSERT
 * est ATOMIQUE : un seul échec rejette tout le lot, d'où le « Aucun modèle n'a été
 * lié » sur les cas filtrés en amont (unique_violation, modèle vide).
 */
const LIER_ERROR_OVERRIDES = {
  // unique_violation : modèle déjà lié (normalement filtré en amont).
  '23505':
    'Un modèle sélectionné est déjà lié à la gamme. Aucun modèle n’a été lié.',
  // check_violation : trigger « modèle vide » (normalement exclu en amont).
  '23514':
    'Un modèle sélectionné est vide (aucune opération). Aucun modèle n’a été lié.',
  // insufficient_privilege : RLS (hors scope d'écriture).
  '42501':
    'Action non autorisée : vous n’avez pas les droits pour modifier cette gamme.',
} as const

/**
 * Sélecteur multiple de modèles d'opération à lier à une gamme. Ne propose que
 * les modèles ACCESSIBLES (pool RLS), NON déjà liés, et compatibles avec la
 * portée de la gamme : une gamme de site peut lier un modèle commun OU de son
 * site ; une gamme commune ne lie que des modèles communs.
 */
export function ImportModeleOperationDialog({
  open,
  onOpenChange,
  gammeId,
  gammeSiteId,
  liesIds,
}: ImportModeleOperationDialogProps) {
  const lier = useLierModelesOperation()
  const poolQuery = useQuery(modelesOperationsQueries.poolImport())

  // Candidats = modèles accessibles, NON VIDES, non déjà liés, dans la portée
  // de la gamme.
  const candidates = useMemo(() => {
    const lies = new Set(liesIds)
    return (poolQuery.data ?? []).filter((m) => {
      // Modèle vide : non liable (trigger 23514) → exclu pour ne pas faire
      // échouer tout l'import groupé (INSERT atomique).
      if (m.nbItems === 0) return false
      if (lies.has(m.id)) return false
      // Cohérence de portée : commun pour toute gamme ; le site exact sinon.
      const compatible =
        m.site_id === null ||
        (gammeSiteId !== null && m.site_id === gammeSiteId)
      return compatible
    })
  }, [poolQuery.data, liesIds, gammeSiteId])

  return (
    <ChecklistDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Importer un modèle d’opération"
      description="Coche les modèles d’opération à rattacher à cette gamme."
      searchPlaceholder="Rechercher un modèle…"
      items={candidates.map((m) => ({
        id: m.id,
        titre: m.nom,
        sousTitre: m.description ?? undefined,
        badge:
          m.site_id === null ? (
            <Badge variant="secondary">Commun</Badge>
          ) : undefined,
      }))}
      submitLabel={(count) => `Lier${count > 0 ? ` (${String(count)})` : ''}`}
      pendingLabel="Liaison…"
      pending={lier.isPending}
      requireSelection
      loading={poolQuery.isPending}
      error={
        poolQuery.isError ? (
          <ErrorState className="py-6" onRetry={() => void poolQuery.refetch()} />
        ) : undefined
      }
      empty="Aucun modèle d’opération disponible à lier."
      noResults="Aucun modèle ne correspond à ta recherche."
      onSubmit={async (ids) => {
        try {
          await lier.mutateAsync({ gammeId, modeleIds: ids })
          toast.success(
            ids.length > 1
              ? 'Modèles d’opération liés'
              : 'Modèle d’opération lié',
          )
        } catch (e) {
          toast.error(writeErrorMessage(e, LIER_ERROR_OVERRIDES))
          throw e
        }
      }}
    />
  )
}
