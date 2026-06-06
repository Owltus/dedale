import { useState } from 'react'
import { toast } from 'sonner'
import { compteRenduSchema } from '../schemas'
import { STATUT_TERMINE } from '../schemas'
import { useChangeStatutChantier } from '../mutations'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clôturer le chantier"
      description="Un compte-rendu est obligatoire pour passer le chantier en « Terminé »."
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
