import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyLocal, localSchema } from '../schemas'
import type { LocalFormValues } from '../schemas'
import { useCreateLocal, useUpdateLocal } from '../mutations'
import { localisationsQueries } from '../queries'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
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
  const [values, setValues] = useState<LocalFormValues>(() =>
    initialValues(local),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof LocalFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = localSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (local) {
        await update.mutateAsync({ id: local.id, values })
        toast.success('Local modifié')
      } else {
        await create.mutateAsync({ niveauId, values })
        toast.success('Local créé')
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
      title={isEdit ? 'Modifier le local' : 'Nouveau local'}
      description="Un local : surface, type et confort thermique."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <IdentiteFields
        nom={{
          value: values.nom,
          onChange: (v) => set('nom', v),
          error: errors.nom,
        }}
        description={{
          value: values.description,
          onChange: (v) => set('description', v),
          error: errors.description,
        }}
        image={{
          value: values.miniature_id,
          onChange: (id) => setValues((v) => ({ ...v, miniature_id: id })),
          targetSiteId: siteId,
          canUpload: true,
        }}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Surface (m²)"
          type="number"
          inputMode="decimal"
          value={values.surface_m2}
          onChange={(v) => set('surface_m2', v)}
          error={errors.surface_m2}
        />
        <SelectField
          label="Type de local"
          value={values.type_local_id}
          onChange={(v) => set('type_local_id', v)}
          error={errors.type_local_id}
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
        value={values.chauffe_climatise}
        onChange={(checked) =>
          setValues((v) => ({ ...v, chauffe_climatise: checked }))
        }
      />
    </FormDialog>
  )
}
