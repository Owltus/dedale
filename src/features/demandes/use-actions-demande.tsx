import { CheckCircle2, Circle, Clock, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DiEditDialog } from '@/features/demandes/components/di-edit-dialog'
import {
  useDeleteDemande,
  useReopenDemande,
  usePrendreEnCharge,
  useCloturerDemande,
} from '@/features/demandes/mutations'
import { diTitre } from '@/features/demandes/schemas'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { writeErrorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import type { RowAction } from '@/components/common/row-actions'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import type { Database } from '@/lib/database.types'

type Demande = Database['public']['Tables']['demandes_intervention']['Row']

/**
 * Menu contextuel (clic droit / appui long) d'une carte de demande, SOURCE UNIQUE
 * partagée par la page Demandes et le tableau de bord : mêmes gestes, mêmes
 * droits, mêmes confirmations partout.
 *
 * - Groupe « statut » EN HAUT (rôles métier) : Ouvert gris, En cours orange,
 *   Clôturé vert ; le statut courant est désactivé.
 * - Modifier / Supprimer EN BAS, décidés PAR LIGNE (propriété + statut pour le
 *   demandeur ; toujours vrai pour admin, manager, technicien).
 *
 * `dialogues` (modale de modification + confirmation de suppression) est à
 * rendre UNE fois dans le conteneur.
 */
export function useActionsDemande({
  siteId,
  role,
  userId,
}: {
  siteId: string
  role: perm.Role | undefined
  userId: string | undefined
}) {
  const del = useDeleteDemande()
  const reopen = useReopenDemande()
  const enCharge = usePrendreEnCharge()
  const cloturer = useCloturerDemande()
  const editDialog = useEntityDialog<Demande>()
  const suppression = useConfirmDelete<Demande>({
    onDelete: (d) => del.mutateAsync(d.id),
    successMessage: 'Demande supprimée',
  })

  function actionsDe(d: Demande): RowAction[] {
    if (!role) return []
    const actions: RowAction[] = []
    if (perm.canResolveDemande(role)) {
      actions.push(
        {
          label: 'Ouvert',
          icon: Circle,
          iconClassName: 'text-muted-foreground',
          disabled: d.statut_di_id === 1,
          onSelect: () =>
            reopen.mutate(d.id, {
              onSuccess: () => toast.success('Demande rouverte'),
              onError: (e) => toast.error(writeErrorMessage(e)),
            }),
        },
        {
          label: 'En cours',
          icon: Clock,
          iconClassName: 'text-warning',
          disabled: d.statut_di_id === 2,
          onSelect: () =>
            enCharge.mutate(d.id, {
              onSuccess: () => toast.success('Demande prise en charge'),
              onError: (e) => toast.error(writeErrorMessage(e)),
            }),
        },
        {
          label: 'Clôturé',
          icon: CheckCircle2,
          iconClassName: 'text-success',
          disabled: d.statut_di_id === 3,
          onSelect: () =>
            cloturer.mutate(d.id, {
              onSuccess: () => toast.success('Demande clôturée'),
              onError: (e) => toast.error(writeErrorMessage(e)),
            }),
        },
      )
    }
    const canEdit = perm.canEditDemande(role, d, userId)
    const canDelete = perm.canDeleteDemande(role, d, userId)
    const sep = actions.length > 0
    if (canEdit)
      actions.push({
        label: 'Modifier',
        icon: Pencil,
        separatorBefore: sep,
        onSelect: () => editDialog.openEdit(d),
      })
    if (canDelete)
      actions.push({
        label: 'Supprimer',
        icon: Trash2,
        destructive: true,
        separatorBefore: sep && !canEdit,
        onSelect: () => suppression.demander(d),
      })
    return actions
  }

  const dialogues = (
    <>
      <DiEditDialog
        key={editDialog.dialogKey}
        open={editDialog.open}
        onOpenChange={editDialog.onOpenChange}
        demande={editDialog.entity}
        siteId={siteId}
      />
      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel="la demande"
        warning={
          suppression.toDelete
            ? `« ${diTitre(suppression.toDelete.constat)} » sera supprimée définitivement.`
            : undefined
        }
      />
    </>
  )

  return { actionsDe, dialogues }
}
