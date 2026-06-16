import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyOperationItem, operationItemSchema } from '../schemas'
import type { OperationItemFormValues } from '../schemas'
import { useCreateOperationItem, useUpdateOperationItem } from '../mutations'
import { referentielsQueries } from '@/features/gammes/queries'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { DescriptionField } from '@/components/common/description-field'
import type { Database } from '@/lib/database.types'

type OperationItem =
  Database['public']['Tables']['modeles_operations_items']['Row']

interface OperationItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modeleId: string
  item?: OperationItem | null
  /** Ordre proposé par défaut à la création (dernier + 1). */
  defaultOrdre: number
}

function initialValues(
  item: OperationItem | null | undefined,
  defaultOrdre: number,
): OperationItemFormValues {
  if (!item) return { ...emptyOperationItem, ordre: String(defaultOrdre) }
  return {
    nom: item.nom,
    ordre: String(item.ordre),
    type_operation_id: String(item.type_operation_id),
    unite_id: item.unite_id !== null ? String(item.unite_id) : '',
    seuil_minimum:
      item.seuil_minimum !== null ? String(item.seuil_minimum) : '',
    seuil_maximum:
      item.seuil_maximum !== null ? String(item.seuil_maximum) : '',
    description: item.description ?? '',
  }
}

export function OperationItemFormDialog({
  open,
  onOpenChange,
  modeleId,
  item,
  defaultOrdre,
}: OperationItemFormDialogProps) {
  const isEdit = Boolean(item)
  const create = useCreateOperationItem()
  const update = useUpdateOperationItem()
  const { data: types = [] } = useQuery(referentielsQueries.typesOperations())
  const { data: unites = [] } = useQuery(referentielsQueries.unites())
  const [values, setValues] = useState<OperationItemFormValues>(() =>
    initialValues(item, defaultOrdre),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  // Le type sélectionné décide si l'opération est une mesure (seuils + unité).
  const selectedType = types.find(
    (t) => String(t.id) === values.type_operation_id,
  )
  const requiresSeuils = selectedType?.necessite_seuils ?? false

  function set<K extends keyof OperationItemFormValues>(
    key: K,
    value: OperationItemFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = operationItemSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (item) {
        await update.mutateAsync({
          id: item.id,
          values: parsed.data,
          requiresSeuils,
        })
        toast.success('Opération modifiée')
      } else {
        await create.mutateAsync({
          modeleId,
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Modifier l'opération" : 'Nouvelle opération'}
      description="Un type « mesure » ajoute l'unité et les seuils."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Libellé"
        value={values.nom}
        onChange={(v) => set('nom', v)}
        error={errors.nom}
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Ordre"
          type="number"
          min={0}
          value={values.ordre}
          onChange={(v) => set('ordre', v)}
          error={errors.ordre}
        />
        <SelectField
          label="Type"
          required
          value={values.type_operation_id}
          onChange={(v) => set('type_operation_id', v)}
          error={errors.type_operation_id}
        >
          <option value="">— Choisir un type —</option>
          {types.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.libelle}
            </option>
          ))}
        </SelectField>
      </div>

      {requiresSeuils && (
        <>
          <SelectField
            label="Unité"
            value={values.unite_id}
            onChange={(v) => set('unite_id', v)}
          >
            <option value="">— Aucune —</option>
            {unites.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.nom} ({u.symbole})
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <DescriptionField
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
    </FormDialog>
  )
}
