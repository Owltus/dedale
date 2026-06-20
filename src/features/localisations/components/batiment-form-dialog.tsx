import { useState } from 'react'
import { toast } from 'sonner'
import { batimentSchema, emptyBatiment } from '../schemas'
import type { BatimentFormValues } from '../schemas'
import { useCreateBatiment, useUpdateBatiment } from '../mutations'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
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
  const [values, setValues] = useState<BatimentFormValues>(() =>
    initialValues(batiment),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof BatimentFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = batimentSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (batiment) {
        await update.mutateAsync({ id: batiment.id, values })
        toast.success('Bâtiment modifié')
      } else {
        await create.mutateAsync({ siteId, values })
        toast.success('Bâtiment créé')
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
      title={isEdit ? 'Modifier le bâtiment' : 'Nouveau bâtiment'}
      description="Un bâtiment du site, qui regroupe des niveaux."
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
    </FormDialog>
  )
}
