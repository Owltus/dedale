import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { validationCapexSchema } from '../schemas'
import type { ValidationCapexFormValues } from '../schemas'
import type { Devis } from '../queries'
import { formatEuros } from '../format'
import { isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { CheckRow } from '@/components/common/checklist-dialog'

interface ValidationInvestissementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /** Date déjà enregistrée : présente = on CORRIGE ; absente = on valide. */
  dateValidation?: string | null
  /** Devis du projet, à cocher (147) ; les retenus sont pré-cochés. */
  devis: readonly Devis[]
  onConfirm: (values: ValidationCapexFormValues) => void
}

/**
 * Valider un projet (demandes PO des 11/11/2026) : la DATE de validation
 * (aujourd'hui par défaut, modifiable) et le CHOIX des devis retenus — valider,
 * c'est choisir. Le montant validé = la somme des devis cochés, affichée.
 *
 * Jumeau de `RefusInvestissementDialog` : l'hôte reste maître de la mutation.
 */
export function ValidationInvestissementDialog({
  open,
  onOpenChange,
  pending,
  dateValidation,
  devis,
  onConfirm,
}: ValidationInvestissementDialogProps) {
  const correction = dateValidation !== undefined
  const form = useForm<ValidationCapexFormValues>({
    resolver: zodResolver(validationCapexSchema),
    defaultValues: {
      date_validation: dateValidation ?? isoLocale(new Date()),
      // Un seul devis : il est d'office le bon.
      devis_retenus:
        devis.length === 1
          ? devis.map((d) => d.id)
          : devis.filter((d) => d.retenu).map((d) => d.id),
    },
  })
  const retenus = useWatch({ control: form.control, name: 'devis_retenus' })
  const total = devis
    .filter((d) => retenus.includes(d.id))
    .reduce((s, d) => s + d.montant_ht, 0)
  const erreur = form.formState.errors.devis_retenus?.message

  function basculer(id: string) {
    // Valeur COURANTE du formulaire, pas celle du dernier rendu : deux cases
    // cochées coup sur coup ne s'écrasent pas.
    const actuels = form.getValues('devis_retenus')
    form.setValue(
      'devis_retenus',
      actuels.includes(id) ? actuels.filter((x) => x !== id) : [...actuels, id],
    )
    form.clearErrors('devis_retenus')
  }

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={correction ? 'Modifier la validation' : 'Valider le projet'}
        description={
          devis.length > 1
            ? 'Quels devis retiens-tu, et quand le projet a-t-il été validé ?'
            : 'Quand le projet a-t-il été validé ?'
        }
        onSubmit={() =>
          void form.handleSubmit((v) => {
            if (devis.length > 0 && v.devis_retenus.length === 0) {
              form.setError('devis_retenus', {
                message: 'Retiens au moins un devis.',
              })
              return
            }
            onConfirm(v)
          })()
        }
        submitLabel={correction ? 'Enregistrer' : 'Valider'}
        pendingLabel="Enregistrement…"
        pending={pending}
      >
        <div className="grid gap-4">
          <DateField
            control={form.control}
            name="date_validation"
            label="Date de validation"
            required
          />
          {devis.length > 1 && (
            <div className="grid gap-2">
              <Label>Devis retenus</Label>
              <div className="divide-y rounded-lg border">
                {devis.map((d) => (
                  <CheckRow
                    key={d.id}
                    titre={`${d.fournisseur} · ${formatEuros(d.montant_ht)} HT`}
                    sousTitre={d.objet}
                    checked={retenus.includes(d.id)}
                    onToggle={() => basculer(d.id)}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                Montant validé : {formatEuros(total)} HT
              </p>
              {erreur && <p className="text-sm text-destructive">{erreur}</p>}
            </div>
          )}
        </div>
      </FormDialog>
    </Form>
  )
}
