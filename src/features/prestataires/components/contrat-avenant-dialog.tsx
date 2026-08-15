import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { avenantSchema, emptyAvenant } from '../schemas'
import type { ContratFormValues } from '../schemas'
import { useCreateAvenant } from '../mutations'
import { typesContratsQueries } from '../queries'
import type { ContratRow } from '../queries'
import { ContratTypeFields } from './contrat-type-fields'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'

interface ContratAvenantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  prestataireId: string
  /** Contrat parent : ses champs pré-remplissent l'avenant. */
  parent: ContratRow
}

/**
 * Dialog de création d'un AVENANT. Pré-rempli depuis le contrat parent
 * (`emptyAvenant`), objet d'avenant obligatoire (`avenantSchema`). À la création,
 * le trigger backend archive le parent (l'avenant devient la version courante).
 * Monter avec `key={parent.id}` côté hôte pour un reset propre.
 */
export function ContratAvenantDialog({
  open,
  onOpenChange,
  siteId,
  prestataireId,
  parent,
}: ContratAvenantDialogProps) {
  const create = useCreateAvenant()
  const { data: types = [] } = useQuery(typesContratsQueries.list())
  const form = useForm<ContratFormValues>({
    resolver: zodResolver(avenantSchema),
    defaultValues: emptyAvenant(parent),
  })
  const submit = useSubmitDialog<ContratFormValues>({
    onSubmit: (data) =>
      create.mutateAsync({
        siteId,
        prestataireId,
        parentId: parent.id,
        values: data,
      }),
    successMessage: 'Avenant créé',
    close: () => onOpenChange(false),
  })

  const typeOptions = types.map((t) => ({
    value: String(t.id),
    label: t.libelle,
  }))

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Nouvel avenant"
        description={`Nouvelle version du contrat « ${parent.reference} ». Le contrat actuel sera archivé.`}
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Créer l'avenant"
        pendingLabel="Création…"
        pending={form.formState.isSubmitting}
        size="lg"
      >
        <ContratTypeFields control={form.control} typeOptions={typeOptions} />
      </FormDialog>
    </Form>
  )
}
