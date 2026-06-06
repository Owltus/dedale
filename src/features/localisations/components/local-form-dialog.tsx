import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyLocal, localSchema } from '../schemas'
import type { LocalFormValues } from '../schemas'
import { useCreateLocal, useUpdateLocal } from '../mutations'
import { localisationsQueries } from '../queries'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import type { Database } from '@/lib/database.types'

type Local = Database['public']['Tables']['locaux']['Row']

interface LocalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  niveauId: string
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
  }
}

export function LocalFormDialog({
  open,
  onOpenChange,
  niveauId,
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
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le local' : 'Nouveau local'}
      description="Renseigne les informations du local."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Nom"
        value={values.nom}
        onChange={(v) => set('nom', v)}
        error={errors.nom}
        required
      />
      <TextField
        label="Description"
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
      <div className="grid grid-cols-2 gap-4">
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
    </FormDialog>
  )
}
