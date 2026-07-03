import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyObservationLever, observationLeverSchema } from '../schemas'
import type { ObservationLeverValues } from '../schemas'
import { useLeverObservation } from '../mutations'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { TextareaField } from '@/components/common/fields/textarea-field'

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
  const form = useForm<ObservationLeverValues>({
    resolver: zodResolver(observationLeverSchema),
    defaultValues: emptyObservationLever(),
  })
  const submit = useSubmitDialog<ObservationLeverValues>({
    onSubmit: (data) =>
      lever.mutateAsync({ id: observationId, leveeBy, values: data }),
    successMessage: 'Observation levée',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Lever l'observation"
        description={description}
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Lever"
        pendingLabel="Levée…"
        pending={form.formState.isSubmitting}
      >
        <DateField
          control={form.control}
          name="date_levee"
          label="Date de levée"
          required
        />

        <TextareaField
          control={form.control}
          name="commentaire_levee"
          label="Commentaire de levée"
          rows={3}
          placeholder="Précisez l'action corrective réalisée…"
        />
      </FormDialog>
    </Form>
  )
}
