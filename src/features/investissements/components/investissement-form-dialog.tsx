import { emptyInvestissement, investissementSchema } from '../schemas'
import type { InvestissementFormValues } from '../schemas'
import { useCreateInvestissement, useUpdateInvestissement } from '../mutations'
import { useAuth } from '@/auth'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { DescriptionField } from '@/components/common/description-field'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

interface InvestissementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  investissement?: Investissement | null
}

function montantToText(value: number | null): string {
  return value === null ? '' : String(value)
}

function initialValues(
  investissement: Investissement | null | undefined,
): InvestissementFormValues {
  if (!investissement) return emptyInvestissement()
  return {
    libelle: investissement.libelle,
    description: investissement.description ?? '',
    montant_demande: montantToText(investissement.montant_demande),
    montant_prevu: montantToText(investissement.montant_prevu),
    depense_reelle: montantToText(investissement.depense_reelle),
    date_demande: investissement.date_demande,
  }
}

export function InvestissementFormDialog({
  open,
  onOpenChange,
  siteId,
  investissement,
}: InvestissementFormDialogProps) {
  const isEdit = Boolean(investissement)
  const { session } = useAuth()
  const create = useCreateInvestissement()
  const update = useUpdateInvestissement()
  const form = useFormDialog({
    schema: investissementSchema,
    initialValues: () => initialValues(investissement),
    onSubmit: (data) => {
      if (investissement) {
        return update.mutateAsync({ id: investissement.id, values: data })
      }
      if (!session) {
        // Session expirée : on interrompt sans toast de succès (message dédié).
        throw new Error('Session expirée, reconnecte-toi.')
      }
      return create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Investissement modifié' : 'Investissement créé',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Modifier l'investissement" : 'Nouvel investissement'}
      description="Renseigne le suivi budgétaire de l'investissement."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <TextField
        label="Libellé"
        value={form.values.libelle}
        onChange={(v) => form.set('libelle', v)}
        error={form.errors.libelle}
        required
      />
      <DescriptionField
        value={form.values.description}
        onChange={(v) => form.set('description', v)}
        error={form.errors.description}
      />
      <div className="grid grid-cols-3 gap-4">
        <TextField
          label="Montant demandé (€)"
          inputMode="decimal"
          value={form.values.montant_demande}
          onChange={(v) => form.set('montant_demande', v)}
          error={form.errors.montant_demande}
        />
        <TextField
          label="Montant prévu (€)"
          inputMode="decimal"
          value={form.values.montant_prevu}
          onChange={(v) => form.set('montant_prevu', v)}
          error={form.errors.montant_prevu}
        />
        <TextField
          label="Dépense réelle (€)"
          inputMode="decimal"
          value={form.values.depense_reelle}
          onChange={(v) => form.set('depense_reelle', v)}
          error={form.errors.depense_reelle}
        />
      </div>
      <TextField
        label="Date de demande"
        type="date"
        value={form.values.date_demande}
        onChange={(v) => form.set('date_demande', v)}
        error={form.errors.date_demande}
        required
      />
    </FormDialog>
  )
}
