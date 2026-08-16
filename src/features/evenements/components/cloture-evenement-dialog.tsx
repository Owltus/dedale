import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clotureSchema } from '../schemas'
import type { ClotureFormValues } from '../schemas'
import { formatDate, isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'

interface ClotureEvenementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /** Date de l'événement : une clôture ne peut pas la précéder. */
  dateEvenement: string
  onConfirm: (values: ClotureFormValues) => void
}

/**
 * Clôture d'un événement : date + compte-rendu.
 *
 * Le compte-rendu est PROPOSÉ mais pas exigé — contrairement aux travaux, où le
 * backend le refuse vide. Un événement peut être clos sans qu'aucune action ait
 * été nécessaire (fausse alerte, remise en route spontanée) : imposer un texte
 * pousserait à écrire « RAS », ce qui ne renseigne personne.
 *
 * La date est saisissable, avec le jour même par défaut. Elle est bornée à la
 * date de l'événement : la contrainte `evenements_dates_coherentes` refuse une
 * clôture antérieure, autant le dire dans le formulaire plutôt que de laisser
 * remonter un 23514. Le front présente, la base valide — les deux le font ici.
 *
 * L'hôte reste maître de la mutation : ce dialogue ne fait que collecter.
 */
export function ClotureEvenementDialog({
  open,
  onOpenChange,
  pending,
  dateEvenement,
  onConfirm,
}: ClotureEvenementDialogProps) {
  const form = useForm<ClotureFormValues>({
    resolver: zodResolver(clotureSchema),
    defaultValues: {
      date_cloture: isoLocale(new Date()),
      compte_rendu: '',
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Clôturer l’événement"
        description="Ce qui a été fait, ou pourquoi il n’y avait rien à faire. Le compte-rendu est facultatif."
        onSubmit={() =>
          void form.handleSubmit((data) => {
            // Miroir du CHECK backend : une clôture ne précède pas l'événement.
            if (data.date_cloture < dateEvenement) {
              form.setError('date_cloture', {
                type: 'min',
                message: `La clôture ne peut pas précéder l’événement (${formatDate(dateEvenement)}).`,
              })
              return
            }
            onConfirm(data)
          })()
        }
        submitLabel="Clôturer"
        pendingLabel="Clôture…"
        pending={pending}
      >
        <DateField
          control={form.control}
          name="date_cloture"
          label="Date de clôture"
          required
        />
        <DescriptionField
          control={form.control}
          name="compte_rendu"
          label="Compte-rendu"
        />
      </FormDialog>
    </Form>
  )
}
