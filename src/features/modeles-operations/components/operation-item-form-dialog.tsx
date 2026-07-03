import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { emptyOperationItem, operationItemSchema } from '../schemas'
import type { OperationItemFormValues } from '../schemas'
import { useCreateOperationItem, useUpdateOperationItem } from '../mutations'
import { referentielsQueries } from '@/features/gammes/queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import {
  OperationFormBase,
  resolveOperationFlags,
} from '@/features/operations/components/operation-form-base'
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

/**
 * Création / modification d'un item de modèle d'opération (Bibliothèque). Même
 * formulaire que les opérations de gamme via `OperationFormBase` (cascade
 * Type → Unité → Seuils, purge des champs masqués) ; seules la table cible
 * (`modeles_operations_items`) et la mutation diffèrent.
 */
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
  const form = useForm<OperationItemFormValues>({
    resolver: zodResolver(operationItemSchema),
    defaultValues: initialValues(item, defaultOrdre),
  })
  const submit = useSubmitDialog<OperationItemFormValues>({
    // L'unité dépend du type (Mesure), les seuils de l'unité : on calcule les
    // deux drapeaux pour que le payload coupe les bons champs.
    onSubmit: (data) => {
      const flags = resolveOperationFlags(data, types, unites)
      return item
        ? update.mutateAsync({ id: item.id, values: data, ...flags })
        : create.mutateAsync({ modeleId, values: data, ...flags })
    },
    successMessage: isEdit ? 'Opération modifiée' : 'Opération ajoutée',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier l’opération' : 'Nouvelle opération'}
        description="Le type « Mesure » ajoute une unité ; selon l’unité, des seuils mini/maxi sont demandés (pas pour un relevé de compteur)."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <OperationFormBase />
      </FormDialog>
    </Form>
  )
}
