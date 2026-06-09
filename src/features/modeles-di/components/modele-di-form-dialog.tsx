import { useState } from 'react'
import { toast } from 'sonner'
import { emptyModeleDi, modeleDiSchema } from '../schemas'
import type { ModeleDiFormValues } from '../schemas'
import { useCreateModeleDi, useUpdateModeleDi } from '../mutations'
import type { ModeleDi } from '../queries'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { TextareaField } from '@/components/common/textarea-field'
import { SelectField } from '@/components/common/select-field'

interface ModeleDiFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modele?: ModeleDi | null
  /** Site de rattachement (scope site strict). */
  siteId: string
}

function initialValues(
  modele: ModeleDi | null | undefined,
): ModeleDiFormValues {
  if (!modele) return emptyModeleDi
  return {
    libelle: modele.libelle,
    description: modele.description ?? '',
    constat_modele: modele.constat_modele,
    etat: modele.est_actif ? 'actif' : 'inactif',
  }
}

export function ModeleDiFormDialog({
  open,
  onOpenChange,
  modele,
  siteId,
}: ModeleDiFormDialogProps) {
  const isEdit = Boolean(modele)
  const { session } = useAuth()
  const create = useCreateModeleDi()
  const update = useUpdateModeleDi()
  const [values, setValues] = useState<ModeleDiFormValues>(() =>
    initialValues(modele),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set<K extends keyof ModeleDiFormValues>(
    key: K,
    value: ModeleDiFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = modeleDiSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (modele) {
        await update.mutateAsync({ id: modele.id, values: parsed.data })
        toast.success('Modèle modifié')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          values: parsed.data,
          siteId,
          createdBy: session.user.id,
        })
        toast.success('Modèle créé')
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
      title={isEdit ? 'Modifier le modèle' : 'Nouveau modèle de DI'}
      description="Un constat pré-rédigé pour accélérer la saisie des demandes d'intervention."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Libellé"
        value={values.libelle}
        onChange={(v) => set('libelle', v)}
        error={errors.libelle}
        required
      />
      <TextareaField
        label="Constat (modèle)"
        value={values.constat_modele}
        onChange={(v) => set('constat_modele', v)}
        error={errors.constat_modele}
        rows={5}
        required
      />
      <SelectField
        label="État"
        value={values.etat}
        onChange={(v) => set('etat', v as ModeleDiFormValues['etat'])}
      >
        <option value="actif">Actif</option>
        <option value="inactif">Masqué</option>
      </SelectField>
      <TextareaField
        label="Description"
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
        rows={2}
      />
    </FormDialog>
  )
}
