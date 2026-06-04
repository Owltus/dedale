import { useState } from 'react'
import { toast } from 'sonner'
import { batimentSchema, emptyBatiment } from '../schemas'
import type { BatimentFormValues } from '../schemas'
import { useCreateBatiment, useUpdateBatiment } from '../mutations'
import { errorMessage, fieldErrors } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/common/text-field'
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
    image_path: batiment.image_path ?? '',
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
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifier le bâtiment' : 'Nouveau bâtiment'}
          </DialogTitle>
          <DialogDescription>
            Renseigne les informations du bâtiment.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
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
            label="Chemin de l’image"
            value={values.image_path}
            onChange={(v) => set('image_path', v)}
            error={errors.image_path}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
