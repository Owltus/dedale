import { useState } from 'react'
import { toast } from 'sonner'
import { compteRenduSchema } from '../schemas'
import { STATUT_TERMINE } from '../schemas'
import { useChangeStatutTravaux } from '../mutations'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'

interface ClotureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  travauxId: string
}

/** Clôture (passage Terminé) : exige un compte-rendu, envoyé avec le statut. */
export function ClotureDialog({
  open,
  onOpenChange,
  travauxId,
}: ClotureDialogProps) {
  const change = useChangeStatutTravaux()
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
        id: travauxId,
        statutId: STATUT_TERMINE,
        compteRendu: parsed.data.compte_rendu,
      })
      toast.success('Travaux clôturé')
      onOpenChange(false)
    } catch (e) {
      // Le trigger backend peut aussi refuser : on affiche l'erreur.
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clôturer le travaux"
      description="Un compte-rendu est obligatoire pour passer le travaux en « Terminé »."
      onSubmit={() => void handleSubmit()}
      submitLabel="Clôturer"
      pendingLabel="Clôture…"
      pending={change.isPending}
    >
      <TextareaField
        label="Compte-rendu"
        required
        rows={5}
        value={compteRendu}
        onChange={setCompteRendu}
        error={error}
      />
    </FormDialog>
  )
}
