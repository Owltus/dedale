import { useState } from 'react'
import { toast } from 'sonner'
import { emptyNiveau, niveauSchema } from '../schemas'
import type { NiveauFormValues } from '../schemas'
import { useCreateNiveau, useUpdateNiveau } from '../mutations'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifier le niveau' : 'Nouveau niveau'}
          </DialogTitle>
          <DialogDescription>
            Renseigne les informations du niveau.
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
            label="Ordre"
            type="number"
            inputMode="numeric"
            value={values.ordre}
            onChange={(v) => set('ordre', v)}
            error={errors.ordre}
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
