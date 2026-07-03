import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { typesDocumentsQueries } from '../queries'
import { useUpdateDocument } from '../mutations'
import type { DocumentMeta } from '../format'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'

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

  const form = useFormDialog({
    schema: documentEditSchema,
    initialValues: (): DocumentEditValues => ({
      nom_original: document?.nom_original ?? '',
      type_document_id: document ? String(document.type_document_id) : '',
    }),
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier le document"
      description="Renomme le document ou change son type. Le fichier n'est pas remplacé."
      onSubmit={() => void form.submit()}
      submitLabel="Enregistrer"
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <TextField
        label="Nom"
        value={form.values.nom_original}
        onChange={(v) => form.set('nom_original', v)}
        error={form.errors.nom_original}
        required
      />
      <SelectField
        label="Type"
        value={form.values.type_document_id}
        onChange={(v) => form.set('type_document_id', v)}
        error={form.errors.type_document_id}
        required
      >
        <option value="">Type…</option>
        {types.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.nom}
          </option>
        ))}
      </SelectField>
    </FormDialog>
  )
}
