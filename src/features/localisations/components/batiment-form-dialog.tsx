import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { batimentSchema, emptyBatiment } from '../schemas'
import type { BatimentFormValues } from '../schemas'
import { useCreateBatiment, useUpdateBatiment } from '../mutations'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import type { Database } from '@/lib/database.types'

type Batiment = Database['public']['Tables']['batiments']['Row']

interface BatimentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  batiment?: Batiment | null
}

function initialValues(
  batiment: Batiment | null | undefined,
): BatimentFormValues {
  if (!batiment) return emptyBatiment
  return {
    nom: batiment.nom,
    description: batiment.description ?? '',
    miniature_id: batiment.miniature_id ?? null,
  }
}

export function BatimentFormDialog({
  open,
  onOpenChange,
  siteId,
  batiment,
}: BatimentFormDialogProps) {
  const isEdit = Boolean(batiment)
  const create = useCreateBatiment()
  const update = useUpdateBatiment()
  const form = useForm<BatimentFormValues>({
    resolver: zodResolver(batimentSchema),
    defaultValues: initialValues(batiment),
  })
  const submit = useSubmitDialog<BatimentFormValues>({
    onSubmit: (data) =>
      batiment
        ? update.mutateAsync({ id: batiment.id, values: data })
        : create.mutateAsync({ siteId, values: data }),
    successMessage: isEdit ? 'Bâtiment modifié' : 'Bâtiment créé',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le bâtiment' : 'Nouveau bâtiment'}
        description="Un bâtiment du site, qui regroupe des niveaux."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <IdentiteFields
          control={form.control}
          nomName="nom"
          descriptionName="description"
          image={{
            name: 'miniature_id',
            targetSiteId: siteId,
            canUpload: true,
          }}
        />
      </FormDialog>
    </Form>
  )
}
