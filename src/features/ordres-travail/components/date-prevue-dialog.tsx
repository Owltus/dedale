import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { FormDialog } from '@/components/common/form-dialog'

interface DatePrevueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Date prévue actuelle (ISO `YYYY-MM-DD`), pré-remplie dans le champ. */
  datePrevue: string
  pending: boolean
  onConfirm: (datePrevue: string) => void
}

/**
 * Replanifie un OT : édition simple de la date prévue. La date courante amorce
 * le champ (calendrier `DateField`) ; on bloque la validation tant qu'aucune
 * date n'est saisie.
 */
export function DatePrevueDialog({
  open,
  onOpenChange,
  datePrevue,
  pending,
  onConfirm,
}: DatePrevueDialogProps) {
  const [valeur, setValeur] = useState(datePrevue)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier la date prévue"
      description="Replanifie cet ordre de travail à une nouvelle date."
      onSubmit={() => onConfirm(valeur)}
      submitLabel="Enregistrer"
      pendingLabel="Enregistrement…"
      pending={pending}
      submitDisabled={valeur.trim() === ''}
    >
      <div className="grid gap-2">
        <Label>Date prévue *</Label>
        <DateField
          className="w-[10rem]"
          ariaLabel="Date prévue"
          value={valeur}
          onValueChange={setValeur}
        />
      </div>
    </FormDialog>
  )
}
