import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { tacheSchema, emptyTache } from '../schemas'
import type { TacheFormValues } from '../schemas'
import { useCreateTache, useUpdateTache } from '../mutations'
import type { TacheItem } from './tache-row'
import { useAuth } from '@/auth'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { EmplacementSelect } from '@/features/equipements/components/emplacement-select'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
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

  const form = useForm<TacheFormValues>({
    resolver: zodResolver(tacheSchema),
    defaultValues: tache
      ? { local_id: tache.local_id, equipement_id: tache.equipement_id ?? '' }
      : emptyTache(),
  })
  const submit = useSubmitDialog<TacheFormValues>({
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

  // Pont vers `LocalEquipementFields` (API contrôlée par props, hors RHF) : on lit
  // le couple local/équipement via `watch`, on le réécrit via `setValue`. On ne
  // revalide qu'APRÈS une première tentative de soumission (`isSubmitted`), comme
  // le fait le resolver sur les champs RHF standards.
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
        title={isEdit ? 'Modifier la zone' : 'Ajouter une zone'}
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
