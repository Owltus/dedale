import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyOperation, operationSchema } from '../schemas'
import type { OperationFormValues } from '../schemas'
import { useCreateOperation, useUpdateOperation } from '../mutations'
import { referentielsQueries } from '../queries'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { DescriptionField } from '@/components/common/description-field'
import type { Database } from '@/lib/database.types'

type Operation = Database['public']['Tables']['operations']['Row']

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

  // Changer de type peut masquer les champs Unité/Seuils. On purge alors leurs
  // valeurs : un champ masqué ne doit jamais porter de valeur incohérente,
  // sinon le refine « min ≤ max » (toujours évalué) bloquerait le submit sur un
  // champ invisible, sans toast ni fermeture (cul-de-sac silencieux).
  function setType(typeId: string) {
    const nextType = types.find((t) => String(t.id) === typeId)
    const nextRequiresSeuils = nextType?.necessite_seuils ?? false
    setValues((v) => ({
      ...v,
      type_operation_id: typeId,
      unite_id: nextRequiresSeuils ? v.unite_id : '',
      seuil_minimum: nextRequiresSeuils ? v.seuil_minimum : '',
      seuil_maximum: nextRequiresSeuils ? v.seuil_maximum : '',
    }))
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
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier l’opération' : 'Nouvelle opération'}
      description="Définis le libellé, l’ordre et le type. Un type « mesure » ajoute l’unité et les seuils."
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
          id="op_type"
          value={values.type_operation_id}
          onChange={(v) => setType(v)}
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
            id="op_unite"
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
        id="op_description"
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
    </FormDialog>
  )
}
