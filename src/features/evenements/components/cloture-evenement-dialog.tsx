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
  /**
   * Valeurs déjà enregistrées. Absentes = on clôture ; présentes = on CORRIGE
   * une clôture existante. Le même dialogue sert aux deux : ce sont les mêmes
   * champs, et en faire deux composants les aurait fait diverger.
   */
  initial?: { date_cloture: string | null; compte_rendu: string | null }
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
  initial,
  onConfirm,
}: ClotureEvenementDialogProps) {
  const correction = initial !== undefined

  const form = useForm<ClotureFormValues>({
    resolver: zodResolver(clotureSchema),
    defaultValues: {
      date_cloture: initial?.date_cloture ?? isoLocale(new Date()),
      compte_rendu: initial?.compte_rendu ?? '',
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={correction ? 'Modifier la clôture' : 'Clôturer l’événement'}
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
        submitLabel={correction ? 'Enregistrer' : 'Clôturer'}
        pendingLabel="Enregistrement…"
        pending={pending}
        // Même largeur que le dialogue de constat : les deux se répondent, et le
        // compte-rendu mérite de la place — c'est souvent le champ le plus long
        // qu'on saisisse sur un événement.
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* La date occupe une seule colonne : c'est un champ court, l'étirer
              sur toute la largeur ne lui donnait rien de plus. */}
          <DateField
            control={form.control}
            name="date_cloture"
            label="Date de clôture"
            required
          />
          <div className="sm:col-span-2">
            <DescriptionField
              control={form.control}
              name="compte_rendu"
              label="Compte-rendu"
              // Le compte-rendu est le SUJET de ce dialogue — la date tient sur
              // une ligne, tout le reste de la place lui revient. Sur deux
              // lignes, un texte d'intervention se lisait par la fenêtre.
              rows={8}
            />
          </div>
        </div>
      </FormDialog>
    </Form>
  )
}
