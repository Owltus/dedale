import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clotureTravauxSchema } from '../schemas'
import type { ClotureTravauxFormValues } from '../schemas'
import { formatDate, isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'

interface ClotureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /** Date de création du travaux : une fin ne peut pas la précéder. */
  dateDemande: string
  /**
   * Valeurs déjà enregistrées. Absentes = on clôture ; présentes = on CORRIGE
   * une clôture existante. Le même dialogue sert aux deux — ce sont les mêmes
   * champs, et en faire deux composants les aurait fait diverger.
   */
  initial?: { date_fin: string | null; compte_rendu: string | null }
  onConfirm: (values: ClotureTravauxFormValues) => void
}

/**
 * Clôture d'un travaux : date de fin + compte-rendu.
 *
 * Jumeau de `ClotureEvenementDialog` et de `ClotureInvestissementDialog` —
 * même mise en page, à une différence près : **le compte-rendu est ici
 * OBLIGATOIRE**, parce que le trigger `validation_travaux_compte_rendu` refuse
 * le passage à « Terminé » sans texte. Un travaux se solde par ce qui a été
 * fait ; un événement peut se clore sur une fausse alerte.
 *
 * La date est saisissable et bornée à la date de création : la clôture se fait
 * souvent quelques jours après la fin réelle du chantier, et la date du jour
 * n'est alors pas la bonne.
 *
 * L'hôte reste maître de la mutation : ce dialogue ne fait que collecter.
 */
export function ClotureDialog({
  open,
  onOpenChange,
  pending,
  dateDemande,
  initial,
  onConfirm,
}: ClotureDialogProps) {
  const correction = initial !== undefined

  const form = useForm<ClotureTravauxFormValues>({
    resolver: zodResolver(clotureTravauxSchema),
    defaultValues: {
      date_fin: initial?.date_fin ?? isoLocale(new Date()),
      compte_rendu: initial?.compte_rendu ?? '',
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={correction ? 'Modifier la clôture' : 'Clôturer le travaux'}
        description="Ce qui a été réalisé, et ce qu'il reste éventuellement à surveiller. Le compte-rendu est obligatoire."
        onSubmit={() =>
          void form.handleSubmit((data) => {
            // La base n'a pas de CHECK de cohérence sur ce couple de dates
            // (contrairement aux événements et aux investissements) : le
            // contrôle est ici le SEUL garde-fou. Il évite une fin antérieure
            // à la création, qui rendrait la fiche incompréhensible.
            if (data.date_fin < dateDemande) {
              form.setError('date_fin', {
                type: 'min',
                message: `La fin ne peut pas précéder la création du travaux (${formatDate(dateDemande)}).`,
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
            name="date_fin"
            label="Date de fin"
            required
          />
          <div className="sm:col-span-2">
            <DescriptionField
              control={form.control}
              name="compte_rendu"
              label="Compte-rendu"
              required
              // Le compte-rendu est le SUJET de ce dialogue : la date tient sur
              // une ligne, tout le reste de la place lui revient.
              rows={8}
            />
          </div>
        </div>
      </FormDialog>
    </Form>
  )
}
