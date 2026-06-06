import { useState } from 'react'
import { motifSchema } from '../schemas'
import { fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'

interface MotifDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  onConfirm: (motif: string) => void
}

/**
 * Dialog générique « motif obligatoire » — utilisé pour annuler un OT
 * (motif_annulation) et pour le rouvrir (RPC reouvrir_ot, p_motif).
 */
export function MotifDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
}: MotifDialogProps) {
  const [motif, setMotif] = useState('')
  const [error, setError] = useState<string | undefined>()

  function handleSubmit() {
    const parsed = motifSchema.safeParse({ motif })
    if (!parsed.success) {
      setError(fieldErrors(parsed.error).motif)
      return
    }
    setError(undefined)
    onConfirm(parsed.data.motif)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={() => handleSubmit()}
      submitLabel={confirmLabel}
      pendingLabel="En cours…"
      pending={pending}
      submitVariant={destructive ? 'destructive' : 'default'}
    >
      <TextareaField
        id="ot-motif"
        label="Motif"
        required
        rows={4}
        value={motif}
        onChange={setMotif}
        error={error}
      />
    </FormDialog>
  )
}
