import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLierModelesOperation } from '../mutations'
import { modelesOperationsQueries } from '@/features/modeles-operations/queries'
import { writeErrorMessage } from '@/lib/form'
import { ChecklistDialog } from '@/components/common/checklist-dialog'
import { ErrorState } from '@/components/common/error-state'

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
  // Le PÉRIMÈTRE (modèles du même scope que la gamme) est porté par la query ;
  // ici on n'écarte que ce qui relève de ce dialog : les modèles VIDES (non
  // liables, trigger 23514 — ils feraient échouer l'INSERT groupé atomique) et
  // ceux déjà rattachés à la gamme.
  const poolQuery = useQuery(modelesOperationsQueries.liables(gammeSiteId))
  const candidates = useMemo(() => {
    const lies = new Set(liesIds)
    return (poolQuery.data ?? []).filter(
      (m) => m.nbItems > 0 && !lies.has(m.id),
    )
  }, [poolQuery.data, liesIds])

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
      }))}
      submitLabel={(count) => `Lier${count > 0 ? ` (${String(count)})` : ''}`}
      pendingLabel="Liaison…"
      pending={lier.isPending}
      requireSelection
      loading={poolQuery.isPending}
      error={
        poolQuery.isError ? (
          <ErrorState
            className="py-6"
            onRetry={() => void poolQuery.refetch()}
          />
        ) : undefined
      }
      empty="Aucun modèle d’opération sur ce site. Va en chercher un dans la Bibliothèque (onglet « Modèles d’opérations », bouton « Importer depuis le commun »)."
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
