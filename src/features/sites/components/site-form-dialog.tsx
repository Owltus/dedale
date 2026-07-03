import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptySite, siteSchema } from '../schemas'
import type { SiteFormValues } from '../schemas'
import { useCreateSite, useUpdateSite } from '../mutations'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
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
  const form = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: initialValues(site),
  })
  const submit = useSubmitDialog<SiteFormValues>({
    onSubmit: (data) =>
      site
        ? update.mutateAsync({ id: site.id, values: data })
        : create.mutateAsync(data),
    successMessage: isEdit ? 'Site modifié' : 'Site créé',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le site' : 'Nouveau site'}
        description="Renseigne les informations du site."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <TextField control={form.control} name="nom" label="Nom" required />
        <TextField control={form.control} name="adresse" label="Adresse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="code_postal"
            label="Code postal"
          />
          <TextField control={form.control} name="ville" label="Ville" />
        </div>
      </FormDialog>
    </Form>
  )
}
