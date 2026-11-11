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
  /** Date de validation enregistrée (pré-remplie). */
  dateValidation: string | null
  onConfirm: (values: ValidationCapexFormValues) => void
}

/**
 * Corriger la DATE de validation d'un projet (demande PO du 11/11/2026).
 * Valider, lui, se fait d'un clic sur la case « Validé », à la date du jour,
 * avec les devis cochés dans le schéma : cette fenêtre ne sert qu'à mettre
 * une autre date ensuite.
 */
export function ValidationInvestissementDialog({
  open,
  onOpenChange,
  pending,
  dateValidation,
  onConfirm,
}: ValidationInvestissementDialogProps) {
  const form = useForm<ValidationCapexFormValues>({
    resolver: zodResolver(validationCapexSchema),
    defaultValues: { date_validation: dateValidation ?? isoLocale(new Date()) },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Modifier la date de validation"
        description="Quand le projet a-t-il été validé ?"
        onSubmit={() => void form.handleSubmit(onConfirm)()}
        submitLabel="Enregistrer"
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
