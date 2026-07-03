import { batimentSchema, emptyBatiment } from '../schemas'
import type { BatimentFormValues } from '../schemas'
import { useCreateBatiment, useUpdateBatiment } from '../mutations'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
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
  const form = useFormDialog({
    schema: batimentSchema,
    initialValues: () => initialValues(batiment),
    onSubmit: (data) =>
      batiment
        ? update.mutateAsync({ id: batiment.id, values: data })
        : create.mutateAsync({ siteId, values: data }),
    successMessage: isEdit ? 'Bâtiment modifié' : 'Bâtiment créé',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le bâtiment' : 'Nouveau bâtiment'}
      description="Un bâtiment du site, qui regroupe des niveaux."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <IdentiteFields
        nom={{
          value: form.values.nom,
          onChange: (v) => form.set('nom', v),
          error: form.errors.nom,
        }}
        description={{
          value: form.values.description,
          onChange: (v) => form.set('description', v),
          error: form.errors.description,
        }}
        image={{
          value: form.values.miniature_id,
          onChange: (id) => form.set('miniature_id', id),
          targetSiteId: siteId,
          canUpload: true,
        }}
      />
    </FormDialog>
  )
}
