import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { validationCapexSchema } from '../schemas'
import type { ValidationCapexFormValues } from '../schemas'
import type { NiveauAccord } from '../mutations'
import { isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'

interface ValidationInvestissementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /** L'accord dont on corrige la date : prévalidation ou confirmation (150). */
  niveau: NiveauAccord
  /** Date enregistrée (pré-remplie). */
  dateValidation: string | null
  onConfirm: (values: ValidationCapexFormValues) => void
}

const TEXTES: Record<
  NiveauAccord,
  { titre: string; question: string; label: string }
> = {
  prevalidation: {
    titre: 'Modifier la date de prévalidation',
    question: 'Quand le projet a-t-il été prévalidé ?',
    label: 'Date de prévalidation',
  },
  validation: {
    titre: 'Modifier la date de confirmation',
    question: 'Quand le projet a-t-il été confirmé ?',
    label: 'Date de confirmation',
  },
}

/**
 * Corriger la DATE d'un accord — prévalidation ou confirmation (demandes PO
 * du 11 et du 12/11/2026). L'accord lui-même se donne d'un clic sur sa case,
 * à la date du jour : cette fenêtre ne sert qu'à mettre une autre date
 * ensuite.
 */
export function ValidationInvestissementDialog({
  open,
  onOpenChange,
  pending,
  niveau,
  dateValidation,
  onConfirm,
}: ValidationInvestissementDialogProps) {
  const form = useForm<ValidationCapexFormValues>({
    resolver: zodResolver(validationCapexSchema),
    defaultValues: { date_validation: dateValidation ?? isoLocale(new Date()) },
  })
  const t = TEXTES[niveau]

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t.titre}
        description={t.question}
        onSubmit={() => void form.handleSubmit(onConfirm)()}
        submitLabel="Enregistrer"
        pendingLabel="Enregistrement…"
        pending={pending}
      >
        <DateField
          control={form.control}
          name="date_validation"
          label={t.label}
          required
        />
      </FormDialog>
    </Form>
  )
}
