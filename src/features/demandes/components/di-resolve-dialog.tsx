import { useState } from 'react'
import { toast } from 'sonner'
import { diResolutionSchema } from '../schemas'
import { useResolveDemande } from '../mutations'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'

interface DiResolveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  diId: string
}

export function DiResolveDialog({
  open,
  onOpenChange,
  diId,
}: DiResolveDialogProps) {
  const resolve = useResolveDemande()
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit() {
    const parsed = diResolutionSchema.safeParse({
      description_resolution: description,
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      await resolve.mutateAsync({
        id: diId,
        descriptionResolution: parsed.data.description_resolution,
      })
      toast.success('Demande résolue')
      onOpenChange(false)
    } catch (e) {
      // Transition interdite / RLS → erreur serveur catchée.
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Résoudre la demande"
      description="Décris la résolution. La date de résolution est enregistrée automatiquement."
      onSubmit={() => void handleSubmit()}
      submitLabel="Résoudre"
      pendingLabel="Enregistrement…"
      pending={resolve.isPending}
    >
      <TextareaField
        id="di-resolution"
        label="Description de résolution"
        required
        rows={4}
        value={description}
        onChange={setDescription}
        error={errors.description_resolution}
      />
    </FormDialog>
  )
}
