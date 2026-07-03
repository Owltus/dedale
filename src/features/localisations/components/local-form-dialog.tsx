import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { emptyLocal, localSchema } from '../schemas'
import type { LocalFormValues, LocalValues } from '../schemas'
import { useCreateLocal, useUpdateLocal } from '../mutations'
import { localisationsQueries } from '../queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { SelectField } from '@/components/common/fields/select-field'
import { CheckboxField } from '@/components/common/fields/checkbox-field'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import type { Database } from '@/lib/database.types'

type Local = Database['public']['Tables']['locaux']['Row']

interface LocalFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  niveauId: string
  /** Site (pour le pool de vignettes : périmètre de la MiniatureField). */
  siteId: string
  local?: Local | null
}

function initialValues(local: Local | null | undefined): LocalFormValues {
  if (!local) return emptyLocal
  return {
    nom: local.nom,
    description: local.description ?? '',
    surface_m2: local.surface_m2 === null ? '' : String(local.surface_m2),
    type_local_id:
      local.type_local_id === null ? '' : String(local.type_local_id),
    miniature_id: local.miniature_id ?? null,
    chauffe_climatise: local.chauffe_climatise,
  }
}

export function LocalFormDialog({
  open,
  onOpenChange,
  niveauId,
  siteId,
  local,
}: LocalFormDialogProps) {
  const isEdit = Boolean(local)
  const create = useCreateLocal()
  const update = useUpdateLocal()
  const { data: types = [] } = useQuery(localisationsQueries.typesLocaux())
  const form = useForm<LocalFormValues, unknown, LocalValues>({
    resolver: zodResolver(localSchema),
    defaultValues: initialValues(local),
  })
  const submit = useSubmitDialog<LocalValues>({
    onSubmit: (data) =>
      local
        ? update.mutateAsync({ id: local.id, values: data })
        : create.mutateAsync({ niveauId, values: data }),
    successMessage: isEdit ? 'Local modifié' : 'Local créé',
    close: () => onOpenChange(false),
  })

  const typeOptions = [
    { value: '', label: '— Aucun —' },
    ...types.map((t) => ({ value: String(t.id), label: t.libelle })),
  ]

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le local' : 'Nouveau local'}
        description="Un local : surface, type et confort thermique."
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="surface_m2"
            label="Surface (m²)"
            type="number"
            inputMode="decimal"
          />
          <SelectField
            control={form.control}
            name="type_local_id"
            label="Type de local"
            options={typeOptions}
          />
        </div>
        <CheckboxField
          control={form.control}
          name="chauffe_climatise"
          label="Chauffé / climatisé"
        />
      </FormDialog>
    </Form>
  )
}
