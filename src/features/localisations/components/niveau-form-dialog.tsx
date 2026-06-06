import { useState } from 'react'
import { toast } from 'sonner'
import { emptyNiveau, niveauSchema } from '../schemas'
import type { NiveauFormValues } from '../schemas'
import { useCreateNiveau, useUpdateNiveau } from '../mutations'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import type { Database } from '@/lib/database.types'

type Niveau = Database['public']['Tables']['niveaux']['Row']

interface NiveauFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  batimentId: string
  niveau?: Niveau | null
}

function initialValues(niveau: Niveau | null | undefined): NiveauFormValues {
  if (!niveau) return emptyNiveau
  return {
    nom: niveau.nom,
    description: niveau.description ?? '',
    ordre: String(niveau.ordre),
  }
}

export function NiveauFormDialog({
  open,
  onOpenChange,
  batimentId,
  niveau,
}: NiveauFormDialogProps) {
  const isEdit = Boolean(niveau)
  const create = useCreateNiveau()
  const update = useUpdateNiveau()
  const [values, setValues] = useState<NiveauFormValues>(() =>
    initialValues(niveau),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof NiveauFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = niveauSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (niveau) {
        await update.mutateAsync({ id: niveau.id, values })
        toast.success('Niveau modifié')
      } else {
        await create.mutateAsync({ batimentId, values })
        toast.success('Niveau créé')
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
      title={isEdit ? 'Modifier le niveau' : 'Nouveau niveau'}
      description="Renseigne les informations du niveau."
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
      <TextField
        label="Ordre"
        type="number"
        inputMode="numeric"
        value={values.ordre}
        onChange={(v) => set('ordre', v)}
        error={errors.ordre}
      />
    </FormDialog>
  )
}
