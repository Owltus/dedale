import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { typesDocumentsQueries } from '../queries'
import { useUpdateDocument } from '../mutations'
import type { DocumentMeta } from '../format'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { SelectField } from '@/components/common/fields/select-field'

const documentEditSchema = z.object({
  nom_original: z.string().trim().min(1, 'Le nom est obligatoire.'),
  // Le Select renvoie une chaîne ; convertie en nombre à l'écriture.
  type_document_id: z.string().min(1, 'Choisis un type.'),
})

type DocumentEditValues = z.input<typeof documentEditSchema>

interface DocumentEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Document à modifier (à monter avec `key` par id pour repartir des valeurs). */
  document: DocumentMeta | null
}

function initialValues(document: DocumentMeta | null): DocumentEditValues {
  return {
    nom_original: document?.nom_original ?? '',
    type_document_id: document ? String(document.type_document_id) : '',
  }
}

/**
 * Modale d'édition d'un document : renomme (nom affiché) et change le type.
 * AUTO-SUFFISANTE — porte sa mutation (`useUpdateDocument`) et le référentiel des
 * types ; se monte sans câblage depuis n'importe quelle liste via `DocumentsListe`
 * (`canEdit`). Ne touche pas au fichier lui-même (stockage/hash inchangés).
 */
export function DocumentEditDialog({
  open,
  onOpenChange,
  document,
}: DocumentEditDialogProps) {
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())
  const update = useUpdateDocument()

  const form = useForm<DocumentEditValues>({
    resolver: zodResolver(documentEditSchema),
    defaultValues: initialValues(document),
  })
  const submit = useSubmitDialog<DocumentEditValues>({
    onSubmit: (data) =>
      update.mutateAsync({
        id: document?.id ?? '',
        values: {
          nom_original: data.nom_original,
          type_document_id: Number(data.type_document_id),
        },
      }),
    successMessage: 'Document modifié',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Modifier le document"
        description="Renomme le document ou change son type. Le fichier n'est pas remplacé."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Enregistrer"
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <TextField
          control={form.control}
          name="nom_original"
          label="Nom"
          required
        />
        <SelectField
          control={form.control}
          name="type_document_id"
          label="Type"
          required
          placeholder="— Choisir un type —"
          options={types.map((t) => ({ value: String(t.id), label: t.nom }))}
        />
      </FormDialog>
    </Form>
  )
}
