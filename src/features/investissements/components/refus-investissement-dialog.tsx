import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { refusCapexSchema } from '../schemas'
import type { RefusCapexFormValues } from '../schemas'
import { isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'

interface RefusInvestissementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /**
   * Refus déjà enregistré : présent = on CORRIGE (date, motif) ; absent = on
   * refuse. Même dialogue pour les deux, comme la réalisation.
   */
  initial?: { date_arret: string | null; motif_arret: string | null }
  onConfirm: (values: RefusCapexFormValues) => void
}

/**
 * Refuser une proposition (demande PO du 11/11/2026) : la date du refus,
 * aujourd'hui par défaut mais modifiable, et un motif facultatif.
 *
 * Jumeau de `ClotureInvestissementDialog` : l'hôte reste maître de la mutation.
 */
export function RefusInvestissementDialog({
  open,
  onOpenChange,
  pending,
  initial,
  onConfirm,
}: RefusInvestissementDialogProps) {
  const correction = initial !== undefined
  const form = useForm<RefusCapexFormValues>({
    resolver: zodResolver(refusCapexSchema),
    defaultValues: {
      date_arret: initial?.date_arret ?? isoLocale(new Date()),
      motif_arret: initial?.motif_arret ?? '',
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={correction ? 'Modifier le refus' : 'Refuser la proposition'}
        description="Quand la proposition a été refusée, et pourquoi si vous voulez le garder en mémoire. Le motif est facultatif."
        onSubmit={() => void form.handleSubmit(onConfirm)()}
        submitLabel={correction ? 'Enregistrer' : 'Refuser'}
        pendingLabel="Enregistrement…"
        pending={pending}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            control={form.control}
            name="date_arret"
            label="Date du refus"
            required
          />
          <div className="sm:col-span-2">
            <DescriptionField
              control={form.control}
              name="motif_arret"
              label="Motif"
              rows={6}
            />
          </div>
        </div>
      </FormDialog>
    </Form>
  )
}
