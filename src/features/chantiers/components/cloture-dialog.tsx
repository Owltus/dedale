import { useState } from 'react'
import { toast } from 'sonner'
import { compteRenduSchema } from '../schemas'
import { STATUT_TERMINE } from '../schemas'
import { useChangeStatutChantier } from '../mutations'
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

interface ClotureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chantierId: string
}

/** Clôture (passage Terminé) : exige un compte-rendu, envoyé avec le statut. */
export function ClotureDialog({
  open,
  onOpenChange,
  chantierId,
}: ClotureDialogProps) {
  const change = useChangeStatutChantier()
  const [compteRendu, setCompteRendu] = useState('')
  const [error, setError] = useState<string | undefined>()

  async function handleSubmit() {
    const parsed = compteRenduSchema.safeParse({ compte_rendu: compteRendu })
    if (!parsed.success) {
      setError(fieldErrors(parsed.error).compte_rendu)
      return
    }
    setError(undefined)
    try {
      await change.mutateAsync({
        id: chantierId,
        statutId: STATUT_TERMINE,
        compteRendu: parsed.data.compte_rendu,
      })
      toast.success('Chantier clôturé')
      onOpenChange(false)
    } catch (e) {
      // Le trigger backend peut aussi refuser : on affiche l'erreur.
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clôturer le chantier</DialogTitle>
          <DialogDescription>
            Un compte-rendu est obligatoire pour passer le chantier en « Terminé
            ».
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
            label="Compte-rendu"
            required
            rows={5}
            value={compteRendu}
            onChange={setCompteRendu}
            error={error}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={change.isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? 'Clôture…' : 'Clôturer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
