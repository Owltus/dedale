import { toast } from 'sonner'
import { STATUT_TERMINE } from '../schemas'
import { useChangeStatutTravaux } from '../mutations'
import { writeErrorMessage } from '@/lib/form'
import { MotifDialog } from '@/components/common/motif-dialog'

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

  function handleConfirm(compteRendu: string) {
    change.mutate(
      { id: travauxId, statutId: STATUT_TERMINE, compteRendu },
      {
        onSuccess: () => {
          toast.success('Travaux clôturé')
          onOpenChange(false)
        },
        // Le trigger backend peut aussi refuser : on affiche l'erreur.
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <MotifDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Clôturer le travaux"
      description="Un compte-rendu est obligatoire pour passer le travaux en « Terminé »."
      label="Compte-rendu"
      rows={5}
      confirmLabel="Clôturer"
      pending={change.isPending}
      onConfirm={handleConfirm}
    />
  )
}
