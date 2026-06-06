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
          <TextareaField
            id="di-resolution"
            label="Description de résolution"
            required
            rows={4}
            value={description}
            onChange={setDescription}
            error={errors.description_resolution}
          />
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
