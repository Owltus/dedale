import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyLocal, localSchema } from '../schemas'
import type { LocalFormValues } from '../schemas'
import { useCreateLocal, useUpdateLocal } from '../mutations'
import { localisationsQueries } from '../queries'
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

type Local = Database['public']['Tables']['locaux']['Row']

interface LocalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  niveauId: string
  local?: Local | null
}

function initialValues(local: Local | null | undefined): LocalFormValues {
  if (!local) return emptyLocal
  return {
    nom: local.nom,
    description: local.description ?? '',
    surface_m2: local.surface_m2 === null ? '' : String(local.surface_m2),
    type_local_id:
      local.type_local_id === null ? '' : String(local.type_local_id),
  }
}

export function LocalFormDialog({
  open,
  onOpenChange,
  niveauId,
  local,
}: LocalFormDialogProps) {
  const isEdit = Boolean(local)
  const create = useCreateLocal()
  const update = useUpdateLocal()
  const { data: types = [] } = useQuery(localisationsQueries.typesLocaux())
  const [values, setValues] = useState<LocalFormValues>(() =>
    initialValues(local),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof LocalFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = localSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (local) {
        await update.mutateAsync({ id: local.id, values })
        toast.success('Local modifié')
      } else {
        await create.mutateAsync({ niveauId, values })
        toast.success('Local créé')
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
            {isEdit ? 'Modifier le local' : 'Nouveau local'}
          </DialogTitle>
          <DialogDescription>
            Renseigne les informations du local.
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
            label="Nom"
            value={values.nom}
            onChange={(v) => set('nom', v)}
            error={errors.nom}
            required
          />
          <TextField
            label="Description"
            value={values.description}
            onChange={(v) => set('description', v)}
            error={errors.description}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Surface (m²)"
              type="number"
              inputMode="decimal"
              value={values.surface_m2}
              onChange={(v) => set('surface_m2', v)}
              error={errors.surface_m2}
            />
            <div className="grid gap-2">
              <Label htmlFor="type_local_id">Type de local</Label>
              <select
                id="type_local_id"
                value={values.type_local_id}
                onChange={(e) => set('type_local_id', e.target.value)}
                aria-invalid={errors.type_local_id ? true : undefined}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              >
                <option value="">— Aucun —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </select>
              {errors.type_local_id && (
                <p className="text-destructive text-sm">
                  {errors.type_local_id}
                </p>
              )}
            </div>
          </div>
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
