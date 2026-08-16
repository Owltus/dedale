import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clotureCapexSchema } from '../schemas'
import type { ClotureCapexFormValues } from '../schemas'
import { formatDate, isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'

interface ClotureInvestissementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /** Date de demande : une clôture ne peut pas la précéder. */
  dateDemande: string
  /**
   * Valeurs déjà enregistrées. Absentes = on clôture ; présentes = on CORRIGE
   * une clôture existante. Le même dialogue sert aux deux — ce sont les mêmes
   * champs, et en faire deux composants les aurait fait diverger.
   */
  initial?: { date_cloture: string | null; bilan: string | null }
  onConfirm: (values: ClotureCapexFormValues) => void
}

/**
 * Clôture d'un investissement : date + bilan budgétaire.
 *
 * Jumeau de `ClotureEvenementDialog` : mêmes règles, même mise en page. Le bilan
 * est proposé mais pas exigé, la date est saisissable (on clôture souvent après
 * coup) et bornée à la date de demande — la contrainte
 * `investissements_dates_coherentes` refuse une clôture antérieure, autant le
 * dire dans le formulaire plutôt que de laisser remonter un 23514.
 *
 * L'hôte reste maître de la mutation : ce dialogue ne fait que collecter.
 */
export function ClotureInvestissementDialog({
  open,
  onOpenChange,
  pending,
  dateDemande,
  initial,
  onConfirm,
}: ClotureInvestissementDialogProps) {
  const correction = initial !== undefined

  const form = useForm<ClotureCapexFormValues>({
    resolver: zodResolver(clotureCapexSchema),
    defaultValues: {
      date_cloture: initial?.date_cloture ?? isoLocale(new Date()),
      bilan: initial?.bilan ?? '',
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={correction ? 'Modifier la clôture' : "Clôturer l'investissement"}
        description="Le budget a-t-il été tenu ? Ce qui explique l'écart, s'il y en a un. Le bilan est facultatif."
        onSubmit={() =>
          void form.handleSubmit((data) => {
            // Miroir du CHECK backend : une clôture ne précède pas la demande.
            if (data.date_cloture < dateDemande) {
              form.setError('date_cloture', {
                type: 'min',
                message: `La clôture ne peut pas précéder la demande (${formatDate(dateDemande)}).`,
              })
              return
            }
            onConfirm(data)
          })()
        }
        submitLabel={correction ? 'Enregistrer' : 'Clôturer'}
        pendingLabel="Enregistrement…"
        pending={pending}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            control={form.control}
            name="date_cloture"
            label="Date de clôture"
            required
          />
          <div className="sm:col-span-2">
            <DescriptionField
              control={form.control}
              name="bilan"
              label="Bilan budgétaire"
              // Le bilan est le SUJET de ce dialogue : la date tient sur une
              // ligne, tout le reste de la place lui revient.
              rows={8}
            />
          </div>
        </div>
      </FormDialog>
    </Form>
  )
}
