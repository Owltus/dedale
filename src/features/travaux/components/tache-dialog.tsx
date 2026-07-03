import { tacheSchema, emptyTache } from '../schemas'
import { useCreateTache, useUpdateTache } from '../mutations'
import type { TacheItem } from './tache-row'
import { useAuth } from '@/auth'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { EmplacementSelect } from '@/features/equipements/components/emplacement-select'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'

interface TacheDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  travauxId: string
  siteId: string
  /** Zone à MODIFIER (local/équipement). Absent = ajout d'une nouvelle zone. */
  tache?: TacheItem | null
}

/**
 * Ajout OU modification d'une ZONE concernée par un travail : un local REQUIS
 * (cascade Niveau → Local) et, le cas échéant, un équipement DE CE LOCAL
 * (optionnel). En création le statut initial est « En attente » (défaut backend) ;
 * il se change ensuite sur la fiche. L'édition ne touche QUE le local/équipement
 * (le statut reste géré en ligne sur la ligne de zone).
 */
export function TacheDialog({
  open,
  onOpenChange,
  travauxId,
  siteId,
  tache,
}: TacheDialogProps) {
  const isEdit = Boolean(tache)
  const { session } = useAuth()
  const create = useCreateTache()
  const update = useUpdateTache()

  const form = useFormDialog({
    schema: tacheSchema,
    initialValues: () =>
      tache
        ? { local_id: tache.local_id, equipement_id: tache.equipement_id ?? '' }
        : emptyTache(),
    onSubmit: async (data) => {
      if (tache) {
        await update.mutateAsync({ id: tache.id, travauxId, values: data })
        return
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      await create.mutateAsync({
        travauxId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Zone modifiée' : 'Zone ajoutée',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier la zone' : 'Ajouter une zone'}
      description="Choisis le local concerné et, si besoin, l'équipement précis."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
      pendingLabel={isEdit ? 'Enregistrement…' : 'Ajout…'}
      pending={form.pending}
    >
      <LocalEquipementFields
        siteId={siteId}
        localId={form.values.local_id}
        equipementId={form.values.equipement_id}
        onChange={({ localId, equipementId }) =>
          form.setValues((v) => ({
            ...v,
            local_id: localId,
            equipement_id: equipementId,
          }))
        }
        errors={form.errors}
        equipementLabel="Équipement concerné"
        disableEquipementWhenEmpty
        renderLieu={(p) => <EmplacementSelect {...p} />}
      />
    </FormDialog>
  )
}
