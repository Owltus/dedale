import { useState } from 'react'
import { toast } from 'sonner'
import { emptyPrestataire, prestataireSchema } from '../schemas'
import type { PrestataireFormValues } from '../schemas'
import { useCreatePrestataire, useUpdatePrestataire } from '../mutations'
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

type Prestataire = Database['public']['Tables']['prestataires']['Row']

interface PrestataireFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prestataire?: Prestataire | null
}

function initialValues(
  prestataire: Prestataire | null | undefined,
): PrestataireFormValues {
  if (!prestataire) return emptyPrestataire
  return {
    libelle: prestataire.libelle,
    metier: prestataire.metier ?? '',
    email: prestataire.email ?? '',
    telephone: prestataire.telephone ?? '',
    siret: prestataire.siret ?? '',
    adresse: prestataire.adresse ?? '',
    code_postal: prestataire.code_postal ?? '',
    ville: prestataire.ville ?? '',
    commentaires: prestataire.commentaires ?? '',
  }
}

export function PrestataireFormDialog({
  open,
  onOpenChange,
  prestataire,
}: PrestataireFormDialogProps) {
  const isEdit = Boolean(prestataire)
  const create = useCreatePrestataire()
  const update = useUpdatePrestataire()
  const [values, setValues] = useState<PrestataireFormValues>(() =>
    initialValues(prestataire),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof PrestataireFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = prestataireSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (prestataire) {
        await update.mutateAsync({ id: prestataire.id, values: parsed.data })
        toast.success('Prestataire modifié')
      } else {
        await create.mutateAsync(parsed.data)
        toast.success('Prestataire créé')
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
            {isEdit ? 'Modifier le prestataire' : 'Nouveau prestataire'}
          </DialogTitle>
          <DialogDescription>
            Renseigne les informations du prestataire.
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
            label="Libellé"
            value={values.libelle}
            onChange={(v) => set('libelle', v)}
            error={errors.libelle}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Métier"
              value={values.metier}
              onChange={(v) => set('metier', v)}
              error={errors.metier}
            />
            <TextField
              label="SIRET"
              value={values.siret}
              onChange={(v) => set('siret', v)}
              error={errors.siret}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Email"
              type="email"
              value={values.email}
              onChange={(v) => set('email', v)}
              error={errors.email}
            />
            <TextField
              label="Téléphone"
              value={values.telephone}
              onChange={(v) => set('telephone', v)}
              error={errors.telephone}
            />
          </div>
          <TextField
            label="Adresse"
            value={values.adresse}
            onChange={(v) => set('adresse', v)}
            error={errors.adresse}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Code postal"
              value={values.code_postal}
              onChange={(v) => set('code_postal', v)}
              error={errors.code_postal}
            />
            <TextField
              label="Ville"
              value={values.ville}
              onChange={(v) => set('ville', v)}
              error={errors.ville}
            />
          </div>
          <TextField
            label="Commentaires"
            value={values.commentaires}
            onChange={(v) => set('commentaires', v)}
            error={errors.commentaires}
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
