import { travauxSchema, emptyTravaux } from '../schemas'
import { useCreateTravaux, useUpdateTravaux } from '../mutations'
import { useAuth } from '@/auth'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { DescriptionField } from '@/components/common/description-field'
import type { Database } from '@/lib/database.types'

type Travaux = Database['public']['Tables']['interventions_travaux']['Row']

interface TravauxFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  travaux?: Travaux | null
  /**
   * Appelé après une CRÉATION réussie, avec le travail créé. L'hôte (liste)
   * s'en sert pour rediriger vers la fiche où l'on ajoute les tâches.
   */
  onCreated?: (travaux: Travaux) => void
}

export function TravauxFormDialog({
  open,
  onOpenChange,
  siteId,
  travaux,
  onCreated,
}: TravauxFormDialogProps) {
  const isEdit = Boolean(travaux)
  const { session } = useAuth()
  const create = useCreateTravaux()
  const update = useUpdateTravaux()

  const form = useFormDialog({
    schema: travauxSchema,
    initialValues: () =>
      travaux
        ? { titre: travaux.titre, description: travaux.description ?? '' }
        : emptyTravaux(),
    onSubmit: async (data): Promise<Travaux | null> => {
      if (travaux) {
        await update.mutateAsync({ id: travaux.id, values: data })
        return null
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      return create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Travaux modifié' : 'Travaux créé',
    close: () => onOpenChange(false),
    // Redirection vers la fiche uniquement après une CRÉATION (édition → null).
    onSuccess: (created) => {
      if (created) onCreated?.(created)
    },
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le travaux' : 'Nouveau travaux'}
      description="Travaux ponctuels du site. Les tâches s'ajoutent ensuite sur la fiche."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <TextField
        label="Titre"
        value={form.values.titre}
        onChange={(v) => form.set('titre', v)}
        error={form.errors.titre}
        required
      />
      <DescriptionField
        value={form.values.description}
        onChange={(v) => form.set('description', v)}
        error={form.errors.description}
      />
    </FormDialog>
  )
}
