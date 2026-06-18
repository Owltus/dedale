import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyInvestissement, investissementSchema } from '../schemas'
import type { InvestissementFormValues } from '../schemas'
import { useCreateInvestissement, useUpdateInvestissement } from '../mutations'
import { statutsCapexQueries } from '../queries'
import { rangStatutCapex } from '../etat'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { DescriptionField } from '@/components/common/description-field'
import { SelectField } from '@/components/common/select-field'
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
    statut_capex_id: String(investissement.statut_capex_id),
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
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const [values, setValues] = useState<InvestissementFormValues>(() =>
    initialValues(investissement),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof InvestissementFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = investissementSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (investissement) {
        await update.mutateAsync({ id: investissement.id, values: parsed.data })
        toast.success('Investissement modifié')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          siteId,
          createdBy: session.user.id,
          values: parsed.data,
        })
        toast.success('Investissement créé')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Modifier l'investissement" : 'Nouvel investissement'}
      description="Renseigne le suivi budgétaire de l'investissement."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Libellé"
        value={values.libelle}
        onChange={(v) => set('libelle', v)}
        error={errors.libelle}
        required
      />
      <DescriptionField
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
      <SelectField
        label="Statut"
        required
        value={values.statut_capex_id}
        onChange={(v) => set('statut_capex_id', v)}
        error={errors.statut_capex_id}
      >
        <option value="">Sélectionne un statut</option>
        {[...statuts]
          .sort((a, b) => rangStatutCapex(a.id) - rangStatutCapex(b.id))
          .map((statut) => (
            <option key={statut.id} value={String(statut.id)}>
              {statut.nom}
            </option>
          ))}
      </SelectField>
      <div className="grid grid-cols-3 gap-4">
        <TextField
          label="Montant demandé (€)"
          inputMode="decimal"
          value={values.montant_demande}
          onChange={(v) => set('montant_demande', v)}
          error={errors.montant_demande}
        />
        <TextField
          label="Montant prévu (€)"
          inputMode="decimal"
          value={values.montant_prevu}
          onChange={(v) => set('montant_prevu', v)}
          error={errors.montant_prevu}
        />
        <TextField
          label="Dépense réelle (€)"
          inputMode="decimal"
          value={values.depense_reelle}
          onChange={(v) => set('depense_reelle', v)}
          error={errors.depense_reelle}
        />
      </div>
      <TextField
        label="Date de demande"
        type="date"
        value={values.date_demande}
        onChange={(v) => set('date_demande', v)}
        error={errors.date_demande}
        required
      />
    </FormDialog>
  )
}
