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
import { Label } from '@/components/ui/label'

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
          <div className="grid gap-2">
            <Label htmlFor="ot-motif">Motif *</Label>
            <textarea
              id="ot-motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={4}
              aria-invalid={error ? true : undefined}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive rounded-md border px-2 py-2 text-sm outline-none focus-visible:ring-[3px]"
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
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
