import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyResiliation, resiliationSchema } from '../schemas'
import type { ResiliationFormValues } from '../schemas'
import { useResilierContrat } from '../mutations'
import type { ContratRow } from '../queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { todayLocal } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'

interface ContratResilierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contrat: ContratRow
}

/**
 * Dialog de résiliation : pose `date_notification` (défaut aujourd'hui) et
 * `date_resiliation`. Ce n'est PAS une suppression (bouton neutre). La base valide
 * l'ordre des dates (CHECK) et refuse un contrat archivé (trigger) — l'erreur
 * remonte en toast. Monter avec `key={contrat.id}` côté hôte pour le reset.
 */
export function ContratResilierDialog({
  open,
  onOpenChange,
  contrat,
}: ContratResilierDialogProps) {
  const resilier = useResilierContrat()
  const form = useForm<ResiliationFormValues>({
    resolver: zodResolver(resiliationSchema),
    defaultValues: emptyResiliation(todayLocal()),
  })
  const submit = useSubmitDialog<ResiliationFormValues>({
    onSubmit: (data) => resilier.mutateAsync({ id: contrat.id, values: data }),
    successMessage: 'Contrat résilié',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Résilier le contrat"
        description={`Contrat « ${contrat.reference} » — délai de préavis : ${String(contrat.delai_preavis_jours)} jours.`}
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Résilier"
        pendingLabel="Résiliation…"
        pending={form.formState.isSubmitting}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField
            control={form.control}
            name="date_notification"
            label="Date de notification"
          />
          <DateField
            control={form.control}
            name="date_resiliation"
            label="Date de résiliation"
            required
          />
        </div>
      </FormDialog>
    </Form>
  )
}
