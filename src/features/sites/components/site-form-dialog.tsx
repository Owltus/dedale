import { emptySite, siteSchema } from '../schemas'
import type { SiteFormValues } from '../schemas'
import { useCreateSite, useUpdateSite } from '../mutations'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
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
  const form = useFormDialog({
    schema: siteSchema,
    initialValues: () => initialValues(site),
    onSubmit: (data) =>
      site
        ? update.mutateAsync({ id: site.id, values: data })
        : create.mutateAsync(data),
    successMessage: isEdit ? 'Site modifié' : 'Site créé',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le site' : 'Nouveau site'}
      description="Renseigne les informations du site."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <TextField
        label="Nom"
        value={form.values.nom}
        onChange={(v) => form.set('nom', v)}
        error={form.errors.nom}
        required
      />
      <TextField
        label="Adresse"
        value={form.values.adresse}
        onChange={(v) => form.set('adresse', v)}
        error={form.errors.adresse}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Code postal"
          value={form.values.code_postal}
          onChange={(v) => form.set('code_postal', v)}
          error={form.errors.code_postal}
        />
        <TextField
          label="Ville"
          value={form.values.ville}
          onChange={(v) => form.set('ville', v)}
          error={form.errors.ville}
        />
      </div>
    </FormDialog>
  )
}
