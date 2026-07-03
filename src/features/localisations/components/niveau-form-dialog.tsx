import { emptyNiveau, niveauSchema } from '../schemas'
import type { NiveauFormValues } from '../schemas'
import { useCreateNiveau, useUpdateNiveau } from '../mutations'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { IdentiteFields } from '@/components/common/identite-fields'
import type { Database } from '@/lib/database.types'

type Niveau = Database['public']['Tables']['niveaux']['Row']

interface NiveauFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  batimentId: string
  /** Site (pour le pool de vignettes : périmètre de la MiniatureField). */
  siteId: string
  niveau?: Niveau | null
}

function initialValues(niveau: Niveau | null | undefined): NiveauFormValues {
  if (!niveau) return emptyNiveau
  return {
    nom: niveau.nom,
    description: niveau.description ?? '',
    ordre: String(niveau.ordre),
    miniature_id: niveau.miniature_id ?? null,
  }
}

export function NiveauFormDialog({
  open,
  onOpenChange,
  batimentId,
  siteId,
  niveau,
}: NiveauFormDialogProps) {
  const isEdit = Boolean(niveau)
  const create = useCreateNiveau()
  const update = useUpdateNiveau()
  const form = useFormDialog({
    schema: niveauSchema,
    initialValues: () => initialValues(niveau),
    onSubmit: (data) =>
      niveau
        ? update.mutateAsync({ id: niveau.id, values: data })
        : create.mutateAsync({ batimentId, values: data }),
    successMessage: isEdit ? 'Niveau modifié' : 'Niveau créé',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le niveau' : 'Nouveau niveau'}
      description="Un niveau du bâtiment, qui regroupe des locaux."
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
      <TextField
        label="Ordre"
        type="number"
        inputMode="numeric"
        value={form.values.ordre}
        onChange={(v) => form.set('ordre', v)}
        error={form.errors.ordre}
      />
    </FormDialog>
  )
}
