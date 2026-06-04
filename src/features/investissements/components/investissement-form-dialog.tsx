import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyInvestissement, investissementSchema } from '../schemas'
import type { InvestissementFormValues } from '../schemas'
import { useCreateInvestissement, useUpdateInvestissement } from '../mutations'
import { statutsCapexQueries } from '../queries'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/common/text-field'
import { Label } from '@/components/ui/label'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier l'investissement" : 'Nouvel investissement'}
          </DialogTitle>
          <DialogDescription>
            Renseigne le suivi budgétaire de l'investissement.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <TextField
            label="Libellé"
            value={values.libelle}
            onChange={(v) => set('libelle', v)}
            error={errors.libelle}
            required
          />
          <TextField
            label="Description"
            value={values.description}
            onChange={(v) => set('description', v)}
            error={errors.description}
          />
          <div className="grid gap-2">
            <Label htmlFor="statut_capex_id">Statut *</Label>
            <select
              id="statut_capex_id"
              value={values.statut_capex_id}
              onChange={(e) => set('statut_capex_id', e.target.value)}
              aria-invalid={errors.statut_capex_id ? true : undefined}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
            >
              <option value="">Sélectionne un statut</option>
              {statuts.map((statut) => (
                <option key={statut.id} value={String(statut.id)}>
                  {statut.nom}
                </option>
              ))}
            </select>
            {errors.statut_capex_id && (
              <p className="text-destructive text-sm">
                {errors.statut_capex_id}
              </p>
            )}
          </div>
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
