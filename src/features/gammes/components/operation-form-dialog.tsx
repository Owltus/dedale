import { useQuery } from '@tanstack/react-query'
import { emptyOperation, operationSchema } from '../schemas'
import type { OperationFormValues } from '../schemas'
import { useCreateOperation, useUpdateOperation } from '../mutations'
import { referentielsQueries } from '../queries'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import {
  OperationFormBase,
  resolveOperationFlags,
} from '@/features/operations/components/operation-form-base'
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

/**
 * Création / modification d'une opération de gamme. Le corps du formulaire (et la
 * cascade Type → Unité → Seuils) est mutualisé via `OperationFormBase` ; ce
 * composant ne porte que le state, la validation et la mutation propres à la table
 * `operations`.
 */
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
  const form = useFormDialog({
    schema: operationSchema,
    initialValues: () => initialValues(operation),
    // L'unité dépend du type (Mesure), les seuils de l'unité : on calcule les
    // deux drapeaux pour que le payload coupe les bons champs.
    onSubmit: (data) => {
      const flags = resolveOperationFlags(data, types, unites)
      return operation
        ? update.mutateAsync({ id: operation.id, values: data, ...flags })
        : create.mutateAsync({ gammeId, values: data, ...flags })
    },
    successMessage: isEdit ? 'Opération modifiée' : 'Opération ajoutée',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier l’opération' : 'Nouvelle opération'}
      description="Le type « Mesure » ajoute une unité ; selon l’unité, des seuils mini/maxi sont demandés (pas pour un relevé de compteur)."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <OperationFormBase
        values={form.values}
        onChange={form.setValues}
        errors={form.errors}
      />
    </FormDialog>
  )
}
