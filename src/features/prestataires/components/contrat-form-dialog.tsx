import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { contratSchema, emptyContrat } from '../schemas'
import type { ContratFormValues } from '../schemas'
import { useCreateContrat, useUpdateContrat } from '../mutations'
import { typesContratsQueries } from '../queries'
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
import { Label } from '@/components/ui/label'
import { TextField } from '@/components/common/text-field'
import type { Database } from '@/lib/database.types'

type Contrat = Database['public']['Tables']['contrats']['Row']

interface ContratFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  prestataireId: string
  contrat?: Contrat | null
}

function initialValues(contrat: Contrat | null | undefined): ContratFormValues {
  if (!contrat) return emptyContrat
  return {
    reference: contrat.reference,
    type_contrat_id: String(contrat.type_contrat_id),
    date_debut: contrat.date_debut,
    date_fin: contrat.date_fin ?? '',
    objet_avenant: contrat.objet_avenant ?? '',
    commentaires: contrat.commentaires ?? '',
  }
}

const selectClasses =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20'

export function ContratFormDialog({
  open,
  onOpenChange,
  siteId,
  prestataireId,
  contrat,
}: ContratFormDialogProps) {
  const isEdit = Boolean(contrat)
  const create = useCreateContrat()
  const update = useUpdateContrat()
  const { data: types = [] } = useQuery(typesContratsQueries.list())
  const [values, setValues] = useState<ContratFormValues>(() =>
    initialValues(contrat),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof ContratFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = contratSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (contrat) {
        await update.mutateAsync({ id: contrat.id, values: parsed.data })
        toast.success('Contrat modifié')
      } else {
        await create.mutateAsync({
          siteId,
          prestataireId,
          values: parsed.data,
        })
        toast.success('Contrat créé')
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
            {isEdit ? 'Modifier le contrat' : 'Nouveau contrat'}
          </DialogTitle>
          <DialogDescription>
            Renseigne les informations du contrat.
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
            label="Référence"
            value={values.reference}
            onChange={(v) => set('reference', v)}
            error={errors.reference}
            required
          />
          <div className="grid gap-2">
            <Label htmlFor="type_contrat_id">Type de contrat *</Label>
            <select
              id="type_contrat_id"
              value={values.type_contrat_id}
              onChange={(e) => set('type_contrat_id', e.target.value)}
              aria-invalid={errors.type_contrat_id ? true : undefined}
              className={selectClasses}
            >
              <option value="">— Sélectionner —</option>
              {types.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.libelle}
                </option>
              ))}
            </select>
            {errors.type_contrat_id && (
              <p className="text-destructive text-sm">
                {errors.type_contrat_id}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Date de début"
              type="date"
              value={values.date_debut}
              onChange={(v) => set('date_debut', v)}
              error={errors.date_debut}
              required
            />
            <TextField
              label="Date de fin"
              type="date"
              value={values.date_fin}
              onChange={(v) => set('date_fin', v)}
              error={errors.date_fin}
            />
          </div>
          <TextField
            label="Objet de l'avenant"
            value={values.objet_avenant}
            onChange={(v) => set('objet_avenant', v)}
            error={errors.objet_avenant}
          />
          <TextField
            label="Commentaires"
            value={values.commentaires}
            onChange={(v) => set('commentaires', v)}
            error={errors.commentaires}
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
