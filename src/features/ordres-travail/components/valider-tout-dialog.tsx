import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { dateObligatoire } from '@/lib/dates-zod'
import { todayLocal } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { SelectField } from '@/components/common/fields/select-field'
import { LIBELLES_STATUT_OP, STATUTS_OP_SAISISSABLES } from '../schemas'

const validerToutSchema = z.object({
  statut: z.string(),
  date: dateObligatoire('La date est obligatoire'),
})
type ValiderToutValues = z.infer<typeof validerToutSchema>

/** Nombre de lignes que le statut choisi va toucher. */
function lignesConcernees(
  statut: string,
  aFaire: number,
  mesures: number,
): number {
  return statut === 'terminee' ? aFaire - mesures : aFaire
}

function texteDescription(n: number, statut: string): string {
  const libelle = (LIBELLES_STATUT_OP[statut] ?? statut).toLowerCase()
  const fin = "L'OT se clôture tout seul s'il ne reste plus rien à faire."
  if (n === 0) return 'Aucune opération à faire ne peut recevoir ce statut.'
  return n > 1
    ? `Les ${String(n)} opérations à faire passeront « ${libelle} » à cette date, puis seront enregistrées. ${fin}`
    : `L'opération à faire passera « ${libelle} » à cette date, puis sera enregistrée. ${fin}`
}

function texteMesures(n: number): string {
  return n > 1
    ? `${String(n)} mesures restent à saisir à la main : elles demandent une valeur.`
    : '1 mesure reste à saisir à la main : elle demande une valeur.'
}

interface ValiderToutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lignes à faire (ni terminées, ni non applicables), mesures comprises. */
  aFaire: number
  /** Mesures parmi elles : laissées de côté par « Terminée », signalées. */
  mesuresRestantes: number
  pending: boolean
  onConfirm: (valeurs: { date: string; statut: string }) => void
}

/**
 * Termine d'un coup toutes les opérations restantes d'un OT, à une date choisie
 * (aujourd'hui par défaut, une autre pour une saisie tardive) — retour PO du
 * 27/11/2026 : 54 BAES contrôlés le même jour ne se cochent pas un par un. Les
 * mesures restent à saisir à la main : elles ne se terminent pas sans valeur.
 */
export function ValiderToutDialog({
  open,
  onOpenChange,
  aFaire,
  mesuresRestantes,
  pending,
  onConfirm,
}: ValiderToutDialogProps) {
  const form = useForm<ValiderToutValues>({
    resolver: zodResolver(validerToutSchema),
    defaultValues: { statut: 'terminee', date: todayLocal() },
  })
  const date = useWatch({ control: form.control, name: 'date' })
  const statut = useWatch({ control: form.control, name: 'statut' })
  const concernees = lignesConcernees(statut, aFaire, mesuresRestantes)

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Tout valider"
        description={texteDescription(concernees, statut)}
        onSubmit={() =>
          void form.handleSubmit((v) =>
            onConfirm({ date: v.date, statut: v.statut }),
          )()
        }
        submitLabel="Tout valider"
        pendingLabel="Enregistrement…"
        pending={pending}
        submitDisabled={date.trim() === '' || concernees === 0}
      >
        <SelectField
          control={form.control}
          name="statut"
          label="Statut"
          required
          options={STATUTS_OP_SAISISSABLES.map((s) => ({
            value: s,
            label: LIBELLES_STATUT_OP[s] ?? s,
          }))}
        />
        <DateField control={form.control} name="date" label="Date" required />
        {statut === 'terminee' && mesuresRestantes > 0 && (
          <p className="text-sm text-muted-foreground">
            {texteMesures(mesuresRestantes)}
          </p>
        )}
      </FormDialog>
    </Form>
  )
}
