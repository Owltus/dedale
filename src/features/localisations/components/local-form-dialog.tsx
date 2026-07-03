import { useQuery } from '@tanstack/react-query'
import { emptyLocal, localSchema } from '../schemas'
import type { LocalFormValues } from '../schemas'
import { useCreateLocal, useUpdateLocal } from '../mutations'
import { localisationsQueries } from '../queries'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { CheckboxField } from '@/components/common/checkbox-field'
import { IdentiteFields } from '@/components/common/identite-fields'
import type { Database } from '@/lib/database.types'

type Local = Database['public']['Tables']['locaux']['Row']

interface LocalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  niveauId: string
  /** Site (pour le pool de vignettes : périmètre de la MiniatureField). */
  siteId: string
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
    miniature_id: local.miniature_id ?? null,
    chauffe_climatise: local.chauffe_climatise,
  }
}

export function LocalFormDialog({
  open,
  onOpenChange,
  niveauId,
  siteId,
  local,
}: LocalFormDialogProps) {
  const isEdit = Boolean(local)
  const create = useCreateLocal()
  const update = useUpdateLocal()
  const { data: types = [] } = useQuery(localisationsQueries.typesLocaux())
  const form = useFormDialog({
    schema: localSchema,
    initialValues: () => initialValues(local),
    onSubmit: (data) =>
      local
        ? update.mutateAsync({ id: local.id, values: data })
        : create.mutateAsync({ niveauId, values: data }),
    successMessage: isEdit ? 'Local modifié' : 'Local créé',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le local' : 'Nouveau local'}
      description="Un local : surface, type et confort thermique."
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Surface (m²)"
          type="number"
          inputMode="decimal"
          value={form.values.surface_m2}
          onChange={(v) => form.set('surface_m2', v)}
          error={form.errors.surface_m2}
        />
        <SelectField
          label="Type de local"
          value={form.values.type_local_id}
          onChange={(v) => form.set('type_local_id', v)}
          error={form.errors.type_local_id}
        >
          <option value="">— Aucun —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.libelle}
            </option>
          ))}
        </SelectField>
      </div>
      <CheckboxField
        label="Chauffé / climatisé"
        value={form.values.chauffe_climatise}
        onChange={(checked) => form.set('chauffe_climatise', checked)}
      />
    </FormDialog>
  )
}
