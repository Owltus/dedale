import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { RadioField } from '@/components/common/fields/radio-field'
import type { Database } from '@/lib/database.types'

type OtOrigine = Database['public']['Enums']['ot_origine']

// Formulaire local : date prévue (non vide) + type d'OT. `z.enum` correspond
// exactement à l'énum `ot_origine` du backend (programme / planifie).
const datePrevueSchema = z.object({
  datePrevue: z.string().min(1),
  origine: z.enum(['planifie', 'programme']),
})
type DatePrevueValues = z.infer<typeof datePrevueSchema>

interface DatePrevueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Date prévue actuelle (ISO `YYYY-MM-DD`), pré-remplie dans le champ. */
  datePrevue: string
  /** Origine actuelle de l'OT (Programmé / Planifié), pré-sélectionnée. */
  origine: OtOrigine
  pending: boolean
  onConfirm: (valeurs: { datePrevue: string; origine: OtOrigine }) => void
}

/**
 * Replanifie un OT : date prévue + bascule de son TYPE (Programmé = généré par le
 * cycle de maintenance préventive / Planifié = date posée par un humain). On bloque
 * la validation tant qu'aucune date n'est saisie. La base valide la bascule d'origine
 * (cf `useUpdateDatePrevueOt`) — et déplacer la date d'un OT « Programmé » le repasse
 * automatiquement en « Planifié » (trigger backend).
 *
 * Date : brique `DateField` (sélecteur calendrier custom, valeur ISO `YYYY-MM-DD`),
 * homogène avec le reste des modales.
 */
export function DatePrevueDialog({
  open,
  onOpenChange,
  datePrevue,
  origine,
  pending,
  onConfirm,
}: DatePrevueDialogProps) {
  const form = useForm<DatePrevueValues>({
    resolver: zodResolver(datePrevueSchema),
    defaultValues: { datePrevue, origine },
  })
  const dateValeur = useWatch({ control: form.control, name: 'datePrevue' })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Modifier la date prévue"
        description="Replanifie cet ordre de travail et ajuste son type (Programmé / Planifié)."
        onSubmit={() => void form.handleSubmit(onConfirm)()}
        submitLabel="Enregistrer"
        pendingLabel="Enregistrement…"
        pending={pending}
        submitDisabled={dateValeur.trim() === ''}
      >
        {/* Date en PLEINE largeur puis le Type en radio EMPILÉ dessous : le radio
            à deux lignes déséquilibrerait une grille 2 colonnes (mobile-first). */}
        <DateField
          control={form.control}
          name="datePrevue"
          label="Date prévue"
          required
        />
        <RadioField
          control={form.control}
          name="origine"
          label="Type"
          options={[
            {
              value: 'planifie',
              label: 'Planifié',
              description: 'Date posée manuellement.',
            },
            {
              value: 'programme',
              label: 'Programmé',
              description: 'Généré automatiquement par le cycle.',
            },
          ]}
        />
      </FormDialog>
    </Form>
  )
}
