import { useState } from 'react'
import { toast } from 'sonner'
import { emptySite, siteSchema } from '../schemas'
import type { SiteFormValues } from '../schemas'
import { useCreateSite, useUpdateSite } from '../mutations'
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

type Site = Database['public']['Tables']['sites']['Row']

interface SiteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  site?: Site | null
}

function initialValues(site: Site | null | undefined): SiteFormValues {
  if (!site) return emptySite
  return {
    nom: site.nom,
    adresse: site.adresse ?? '',
    code_postal: site.code_postal ?? '',
    ville: site.ville ?? '',
  }
}

export function SiteFormDialog({
  open,
  onOpenChange,
  site,
}: SiteFormDialogProps) {
  const isEdit = Boolean(site)
  const create = useCreateSite()
  const update = useUpdateSite()
  const [values, setValues] = useState<SiteFormValues>(() =>
    initialValues(site),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof SiteFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = siteSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (site) {
        await update.mutateAsync({ id: site.id, values: parsed.data })
        toast.success('Site modifié')
      } else {
        await create.mutateAsync(parsed.data)
        toast.success('Site créé')
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
            {isEdit ? 'Modifier le site' : 'Nouveau site'}
          </DialogTitle>
          <DialogDescription>
            Renseigne les informations du site.
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
