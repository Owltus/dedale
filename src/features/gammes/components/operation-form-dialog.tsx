import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyOperation, operationSchema } from '../schemas'
import type { OperationFormValues } from '../schemas'
import { useCreateOperation, useUpdateOperation } from '../mutations'
import { referentielsQueries } from '../queries'
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

type Operation = Database['public']['Tables']['operations']['Row']

const SELECT_CLASS =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]'

interface OperationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gammeId: string
  operation?: Operation | null
}

function initialValues(op: Operation | null | undefined): OperationFormValues {
  if (!op) return emptyOperation
  return {
    nom: op.nom,
    ordre: String(op.ordre),
    type_operation_id: String(op.type_operation_id),
    unite_id: op.unite_id !== null ? String(op.unite_id) : '',
    seuil_minimum: op.seuil_minimum !== null ? String(op.seuil_minimum) : '',
    seuil_maximum: op.seuil_maximum !== null ? String(op.seuil_maximum) : '',
    description: op.description ?? '',
  }
}

export function OperationFormDialog({
  open,
  onOpenChange,
  gammeId,
  operation,
}: OperationFormDialogProps) {
  const isEdit = Boolean(operation)
  const create = useCreateOperation()
  const update = useUpdateOperation()
  const { data: types = [] } = useQuery(referentielsQueries.typesOperations())
  const { data: unites = [] } = useQuery(referentielsQueries.unites())
  const [values, setValues] = useState<OperationFormValues>(() =>
    initialValues(operation),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  // Le type sélectionné décide si l'opération est une mesure (seuils + unité).
  const selectedType = types.find(
    (t) => String(t.id) === values.type_operation_id,
  )
  const requiresSeuils = selectedType?.necessite_seuils ?? false

  function set<K extends keyof OperationFormValues>(
    key: K,
    value: OperationFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = operationSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (operation) {
        await update.mutateAsync({
          id: operation.id,
          values: parsed.data,
          requiresSeuils,
        })
        toast.success('Opération modifiée')
      } else {
        await create.mutateAsync({
          gammeId,
          values: parsed.data,
          requiresSeuils,
        })
        toast.success('Opération ajoutée')
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
            {isEdit ? 'Modifier l’opération' : 'Nouvelle opération'}
          </DialogTitle>
          <DialogDescription>
            Définis le libellé, l’ordre et le type. Un type « mesure » ajoute
            l’unité et les seuils.
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
            value={values.nom}
            onChange={(v) => set('nom', v)}
            error={errors.nom}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Ordre"
              type="number"
              min={0}
              value={values.ordre}
              onChange={(v) => set('ordre', v)}
              error={errors.ordre}
            />
            <div className="grid gap-2">
              <Label htmlFor="op_type">Type *</Label>
              <select
                id="op_type"
                value={values.type_operation_id}
                onChange={(e) => set('type_operation_id', e.target.value)}
                aria-invalid={errors.type_operation_id ? true : undefined}
                className={SELECT_CLASS}
              >
                <option value="">— Choisir un type —</option>
                {types.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.libelle}
                  </option>
                ))}
              </select>
              {errors.type_operation_id && (
                <p className="text-destructive text-sm">
                  {errors.type_operation_id}
                </p>
              )}
            </div>
          </div>

          {requiresSeuils && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="op_unite">Unité</Label>
                <select
                  id="op_unite"
                  value={values.unite_id}
                  onChange={(e) => set('unite_id', e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— Aucune —</option>
                  {unites.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.nom} ({u.symbole})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  label="Seuil minimum"
                  type="number"
                  value={values.seuil_minimum}
                  onChange={(v) => set('seuil_minimum', v)}
                  error={errors.seuil_minimum}
                />
                <TextField
                  label="Seuil maximum"
                  type="number"
                  value={values.seuil_maximum}
                  onChange={(v) => set('seuil_maximum', v)}
                  error={errors.seuil_maximum}
                />
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="op_description">Description</Label>
            <textarea
              id="op_description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
            {errors.description && (
              <p className="text-destructive text-sm">{errors.description}</p>
            )}
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
              {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
