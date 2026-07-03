import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyNiveau, niveauSchema } from '../schemas'
import type { NiveauFormValues, NiveauValues } from '../schemas'
import { useCreateNiveau, useUpdateNiveau } from '../mutations'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import type { Database } from '@/lib/database.types'

type Niveau = Database['public']['Tables']['niveaux']['Row']

interface NiveauFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  batimentId: string
  /** Site (pour le pool de vignettes : périmètre de la MiniatureField). */
  siteId: string
  niveau?: Niveau | null
}

function initialValues(niveau: Niveau | null | undefined): NiveauFormValues {
  if (!niveau) return emptyNiveau
  return {
    nom: niveau.nom,
    description: niveau.description ?? '',
    ordre: String(niveau.ordre),
    miniature_id: niveau.miniature_id ?? null,
  }
}

export function NiveauFormDialog({
  open,
  onOpenChange,
  batimentId,
  siteId,
  niveau,
}: NiveauFormDialogProps) {
  const isEdit = Boolean(niveau)
  const create = useCreateNiveau()
  const update = useUpdateNiveau()
  // Schéma à TRANSFORM (`ordre` string → number) : `useForm<Input, _, Output>`
  // typé, le resolver valide et transforme, `data` arrive déjà en Output.
  const form = useForm<NiveauFormValues, unknown, NiveauValues>({
    resolver: zodResolver(niveauSchema),
    defaultValues: initialValues(niveau),
  })
  const submit = useSubmitDialog<NiveauValues>({
    onSubmit: (data) =>
      niveau
        ? update.mutateAsync({ id: niveau.id, values: data })
        : create.mutateAsync({ batimentId, values: data }),
    successMessage: isEdit ? 'Niveau modifié' : 'Niveau créé',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le niveau' : 'Nouveau niveau'}
        description="Un niveau du bâtiment, qui regroupe des locaux."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <IdentiteFields
          control={form.control}
          nomName="nom"
          descriptionName="description"
          image={{ name: 'miniature_id', targetSiteId: siteId, canUpload: true }}
        />
        <TextField
          control={form.control}
          name="ordre"
          label="Ordre"
          type="number"
          inputMode="numeric"
          hint="Ordre d'affichage dans la liste"
        />
      </FormDialog>
    </Form>
  )
}
