import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { validationCapexSchema } from '../schemas'
import type { ValidationCapexFormValues } from '../schemas'
import { isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'

interface ValidationInvestissementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /** Date déjà enregistrée : présente = on CORRIGE ; absente = on valide. */
  dateValidation?: string | null
  onConfirm: (values: ValidationCapexFormValues) => void
}

/**
 * Valider une proposition (demande PO du 11/11/2026) : seulement la DATE de
 * validation, aujourd'hui par défaut mais modifiable — pas de montant (la
 * proposition fait foi), pas de description.
 *
 * Jumeau de `RefusInvestissementDialog` : l'hôte reste maître de la mutation.
 */
export function ValidationInvestissementDialog({
  open,
  onOpenChange,
  pending,
  dateValidation,
  onConfirm,
}: ValidationInvestissementDialogProps) {
  const correction = dateValidation !== undefined
  const form = useForm<ValidationCapexFormValues>({
    resolver: zodResolver(validationCapexSchema),
    defaultValues: {
      date_validation: dateValidation ?? isoLocale(new Date()),
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={correction ? 'Modifier la validation' : 'Valider la proposition'}
        description="Quand la proposition a-t-elle été validée ?"
        onSubmit={() => void form.handleSubmit(onConfirm)()}
        submitLabel={correction ? 'Enregistrer' : 'Valider'}
        pendingLabel="Enregistrement…"
        pending={pending}
      >
        <DateField
          control={form.control}
          name="date_validation"
          label="Date de validation"
          required
        />
      </FormDialog>
    </Form>
  )
}
