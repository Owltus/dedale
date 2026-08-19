import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { lieuSchema, emptyLieu } from '../schemas'
import type { LieuFormValues } from '../schemas'
import { useCreateLieu, useUpdateLieu } from '../mutations'
import type { LieuItem } from './lieu-row'
import { useAuth } from '@/auth'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { EmplacementSelect } from '@/features/equipements/components/emplacement-select'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'

interface LieuDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  evenementId: string
  siteId: string
  /** Lieu à MODIFIER (local/équipement). Absent = ajout d'un nouveau lieu. */
  lieu?: LieuItem | null
}

/**
 * Ajout OU modification d'un LIEU concerné par un événement : un local REQUIS
 * (cascade Niveau → Local) et, le cas échéant, un équipement DE CE LOCAL
 * (optionnel). Miroir de `TacheDialog`, sans notion de statut (un lieu
 * d'événement n'est pas une tâche à réaliser).
 */
export function LieuDialog({
  open,
  onOpenChange,
  evenementId,
  siteId,
  lieu,
}: LieuDialogProps) {
  const isEdit = Boolean(lieu)
  const { session } = useAuth()
  const create = useCreateLieu()
  const update = useUpdateLieu()

  const form = useForm<LieuFormValues>({
    resolver: zodResolver(lieuSchema),
    defaultValues: lieu
      ? { local_id: lieu.local_id, equipement_id: lieu.equipement_id ?? '' }
      : emptyLieu(),
  })
  const submit = useSubmitDialog<LieuFormValues>({
    onSubmit: async (data) => {
      if (lieu) {
        await update.mutateAsync({ id: lieu.id, evenementId, values: data })
        return
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      await create.mutateAsync({
        evenementId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Lieu modifié' : 'Lieu ajouté',
    close: () => onOpenChange(false),
  })

  const { errors, isSubmitted, isSubmitting } = form.formState
  const localId = useWatch({ control: form.control, name: 'local_id' })
  const equipementId = useWatch({
    control: form.control,
    name: 'equipement_id',
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le lieu' : 'Ajouter un lieu'}
        description="Choisis le local concerné et, si besoin, l'équipement précis."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
        pendingLabel={isEdit ? 'Enregistrement…' : 'Ajout…'}
        pending={isSubmitting}
      >
        <LocalEquipementFields
          siteId={siteId}
          localId={localId}
          equipementId={equipementId}
          onChange={({
            localId: nextLocalId,
            equipementId: nextEquipementId,
          }) => {
            form.setValue('local_id', nextLocalId, {
              shouldValidate: isSubmitted,
            })
            form.setValue('equipement_id', nextEquipementId, {
              shouldValidate: isSubmitted,
            })
          }}
          errors={{
            local_id: errors.local_id?.message,
            equipement_id: errors.equipement_id?.message,
          }}
          equipementLabel="Équipement concerné"
          disableEquipementWhenEmpty
          renderLieu={(p) => <EmplacementSelect {...p} />}
        />
      </FormDialog>
    </Form>
  )
}
