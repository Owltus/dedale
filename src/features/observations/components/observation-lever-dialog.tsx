import { useState } from 'react'
import { toast } from 'sonner'
import { emptyObservationLever, observationLeverSchema } from '../schemas'
import type { ObservationLeverValues } from '../schemas'
import { useLeverObservation } from '../mutations'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { TextField } from '@/components/common/text-field'
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

interface ObservationLeverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  observationId: string
  description: string
  leveeBy: string
}

/**
 * Levée d'une observation : capture la date de levée + un commentaire optionnel.
 * Le statut bascule en 'levee' et levee_by est renseigné côté mutation (exigés
 * ensemble par le CHECK backend). La preuve documentaire est reportée en V1.5.
 */
export function ObservationLeverDialog({
  open,
  onOpenChange,
  observationId,
  description,
  leveeBy,
}: ObservationLeverDialogProps) {
  const lever = useLeverObservation()
  const [values, setValues] = useState<ObservationLeverValues>(() =>
    emptyObservationLever(),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit() {
    const parsed = observationLeverSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      await lever.mutateAsync({
        id: observationId,
        leveeBy,
        values: parsed.data,
      })
      toast.success('Observation levée')
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lever l'observation</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <TextField
            id="lever-date"
            label="Date de levée"
            type="date"
            required
            value={values.date_levee}
            onChange={(date_levee) => setValues((v) => ({ ...v, date_levee }))}
            error={errors.date_levee}
          />

          <TextareaField
            id="lever-commentaire"
            label="Commentaire de levée"
            rows={3}
            value={values.commentaire_levee}
            onChange={(commentaire_levee) =>
              setValues((v) => ({ ...v, commentaire_levee }))
            }
            error={errors.commentaire_levee}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={lever.isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={lever.isPending}>
              {lever.isPending ? 'Levée…' : 'Lever'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
