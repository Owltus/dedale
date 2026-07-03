import { useState } from 'react'
import { toast } from 'sonner'
import { deleteErrorMessage } from '@/lib/form'

interface UseConfirmDeleteOptions<T> {
  /**
   * Suppression effective (généralement `del.mutateAsync(...)`). Reçoit
   * l'élément demandé ; une erreur rejetée est traduite en toast.
   */
  onDelete: (item: T) => Promise<unknown>
  /** Message du toast de succès (ou fabrique, pour un message contextualisé). */
  successMessage: string | ((item: T) => string)
  /**
   * Traduction du message d'erreur (défaut : `deleteErrorMessage`). À surcharger
   * quand la suppression est une écriture « métier » (ex. `writeErrorMessage`).
   */
  errorMessage?: (e: unknown) => string
  /** Appelé APRÈS le succès (toast + fermeture), ex. navigation de repli. */
  onSuccess?: (item: T) => void
}

/** Props prêtes à étaler sur `ConfirmDeleteDialog` / `ConfirmDialog`. */
interface ConfirmDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  onConfirm: () => void
}

/**
 * Factorise le trio « état `toDelete` + confirmation + câblage du dialog » des
 * suppressions confirmées : `demander(item)` ouvre la confirmation,
 * `confirmer()` exécute `onDelete` puis toast de succès + fermeture (ou toast
 * d'erreur traduit, dialog laissé ouvert). Générique sur `T` : entité complète
 * (`Site`, `DocumentMeta`…) ou simple id, au choix de l'hôte.
 *
 * Usage :
 * ```tsx
 * const del = useDeleteSite()
 * const suppression = useConfirmDelete<Site>({
 *   onDelete: (s) => del.mutateAsync(s.id),
 *   successMessage: 'Site supprimé',
 * })
 * // …
 * <ConfirmDeleteDialog
 *   {...suppression.dialogProps}
 *   entityLabel={suppression.toDelete ? `le site « ${suppression.toDelete.nom} »` : 'le site'}
 * />
 * ```
 */
export function useConfirmDelete<T>({
  onDelete,
  successMessage,
  errorMessage = deleteErrorMessage,
  onSuccess,
}: UseConfirmDeleteOptions<T>): {
  /** Élément dont la suppression est demandée (null = dialog fermé). */
  toDelete: T | null
  /** Ouvre la confirmation pour cet élément. */
  demander: (item: T) => void
  /** Referme la confirmation sans supprimer. */
  annuler: () => void
  /** Exécute la suppression de l'élément demandé (no-op si déjà en cours). */
  confirmer: () => void
  /** Vrai pendant la suppression (→ spinner du dialog). */
  pending: boolean
  /** Paquet `open`/`onOpenChange`/`loading`/`onConfirm` à étaler sur le dialog. */
  dialogProps: ConfirmDeleteDialogProps
} {
  const [toDelete, setToDelete] = useState<T | null>(null)
  const [pending, setPending] = useState(false)

  function confirmer(): void {
    if (toDelete === null || pending) return
    const item = toDelete
    setPending(true)
    void (async () => {
      try {
        await onDelete(item)
        toast.success(
          typeof successMessage === 'function'
            ? successMessage(item)
            : successMessage,
        )
        setToDelete(null)
        onSuccess?.(item)
      } catch (e) {
        toast.error(errorMessage(e))
      } finally {
        setPending(false)
      }
    })()
  }

  return {
    toDelete,
    demander: (item) => setToDelete(item),
    annuler: () => setToDelete(null),
    confirmer,
    pending,
    dialogProps: {
      open: toDelete !== null,
      onOpenChange: (open) => {
        if (!open) setToDelete(null)
      },
      loading: pending,
      onConfirm: confirmer,
    },
  }
}
