import { useState } from 'react'
import { toast } from 'sonner'
import { travauxSchema, emptyTravaux } from '../schemas'
import type { TravauxFormValues } from '../schemas'
import { useCreateTravaux, useUpdateTravaux } from '../mutations'
import { useAuth } from '@/auth'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
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

  const [values, setValues] = useState<TravauxFormValues>(() =>
    travaux
      ? {
          titre: travaux.titre,
          description: travaux.description ?? '',
        }
      : emptyTravaux(),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof TravauxFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = travauxSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (travaux) {
        await update.mutateAsync({ id: travaux.id, values: parsed.data })
        toast.success('Travaux modifié')
        onOpenChange(false)
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        const created = await create.mutateAsync({
          siteId,
          createdBy: session.user.id,
          values: parsed.data,
        })
        toast.success('Travaux créé')
        onOpenChange(false)
        onCreated?.(created)
      }
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le travaux' : 'Nouveau travaux'}
      description="Travaux ponctuels du site. Les tâches s'ajoutent ensuite sur la fiche."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Titre"
        value={values.titre}
        onChange={(v) => set('titre', v)}
        error={errors.titre}
        required
      />
      <DescriptionField
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
    </FormDialog>
  )
}
