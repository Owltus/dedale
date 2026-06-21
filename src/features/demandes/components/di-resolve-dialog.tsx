import { useState } from 'react'
import { toast } from 'sonner'
import { diResolutionSchema } from '../schemas'
import { useResolveDemande } from '../mutations'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'

interface DiResolveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  diId: string
}

/**
 * Clôture d'une DI : on saisit une NOTE de clôture (obligatoire) ; le passage en
 * « Clôturé » (statut 3), le QUI (resolved_by) et le QUAND (date_resolution) sont
 * posés côté serveur (triggers). Une RLS / règle refusée → erreur catchée.
 */
export function DiResolveDialog({
  open,
  onOpenChange,
  diId,
}: DiResolveDialogProps) {
  const cloturer = useResolveDemande()
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
      await cloturer.mutateAsync({
        id: diId,
        descriptionResolution: parsed.data.description_resolution,
      })
      toast.success('Demande clôturée')
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clôturer la demande"
      description="Décris ce qui a été fait. La date de clôture est enregistrée automatiquement."
      onSubmit={() => void handleSubmit()}
      submitLabel="Clôturer"
      pendingLabel="Clôture…"
      pending={cloturer.isPending}
    >
      <TextareaField
        id="di-cloture"
        label="Note de clôture"
        required
        rows={4}
        value={description}
        onChange={setDescription}
        error={errors.description_resolution}
      />
    </FormDialog>
  )
}
