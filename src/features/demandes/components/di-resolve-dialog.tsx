import { useState } from 'react'
import { toast } from 'sonner'
import { diResolutionSchema } from '../schemas'
import { useResolveDemande } from '../mutations'
import { errorMessage, fieldErrors } from '@/lib/form'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Résoudre la demande</DialogTitle>
          <DialogDescription>
            Décris la résolution. La date de résolution est enregistrée
            automatiquement.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="di-resolution">Description de résolution *</Label>
            <textarea
              id="di-resolution"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={errors.description_resolution ? true : undefined}
              rows={4}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive min-h-20 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
            />
            {errors.description_resolution && (
              <p className="text-destructive text-sm">
                {errors.description_resolution}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={resolve.isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={resolve.isPending}>
              {resolve.isPending ? 'Enregistrement…' : 'Résoudre'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
