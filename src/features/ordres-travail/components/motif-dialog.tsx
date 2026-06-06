import { useState } from 'react'
import { motifSchema } from '../schemas'
import { fieldErrors } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-col gap-4"
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
            >
              {pending ? 'En cours…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
