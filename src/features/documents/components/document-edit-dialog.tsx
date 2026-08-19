import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { toast } from 'sonner'
import { typesDocumentsQueries } from '../queries'
import { useReplaceDocumentFile, useUpdateDocument } from '../mutations'
import { MIME_AUTORISES, validerFichier } from '../upload'
import { formatMime, formatTaille } from '../format'
import type { DocumentMeta } from '../format'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { writeErrorMessage } from '@/lib/form'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { SelectField } from '@/components/common/fields/select-field'
import { FileDropField } from '@/components/common/file-drop-field'
import { Label } from '@/components/ui/label'

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
 * Modale d'édition d'un document : renomme (nom affiché), change le type, et
 * peut REMPLACER le fichier lui-même (nouveau contenu, MÊME `id` → toutes les
 * liaisons existantes restent en place, pas besoin de rerattacher le document
 * partout où il apparaît). AUTO-SUFFISANTE — porte ses mutations
 * (`useUpdateDocument` + `useReplaceDocumentFile`) et le référentiel des
 * types ; se monte sans câblage depuis n'importe quelle liste via
 * `DocumentsListe` (`canEdit`).
 */
export function DocumentEditDialog({
  open,
  onOpenChange,
  document,
}: DocumentEditDialogProps) {
  const { session } = useAuth()
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())
  const update = useUpdateDocument()
  const replace = useReplaceDocumentFile()

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

  // Remplacement de fichier : action INDÉPENDANTE du formulaire (nom/type) —
  // déposer un fichier l'envoie immédiatement, sans passer par « Enregistrer »
  // ni fermer la modale (l'utilisateur peut ensuite aussi renommer, ou juste
  // fermer). Le document garde son id → aucune fiche où il est rattaché n'a
  // besoin d'être retouchée.
  async function remplacerFichier(files: File[]) {
    const file = files[0]
    if (!file || !document || !session) return
    const erreur = validerFichier(file)
    if (erreur) {
      toast.error(erreur)
      return
    }
    try {
      await replace.mutateAsync({
        documentId: document.id,
        file,
        uploadedBy: session.user.id,
      })
      toast.success('Fichier remplacé')
    } catch (e) {
      toast.error(
        writeErrorMessage(e, {
          '23505':
            'Ce contenu correspond déjà à un autre document de la bibliothèque du site — remplacement impossible sans créer de doublon.',
        }),
      )
    }
  }

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Modifier le document"
        description="Renomme le document, change son type, ou remplace son fichier."
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

        <div className="grid gap-2">
          <Label htmlFor="document-remplacement">Fichier</Label>
          {document && (
            <p className="text-sm text-muted-foreground">
              Actuel : {formatMime(document.mime_type)} ·{' '}
              {formatTaille(document.taille_octets)}
            </p>
          )}
          <FileDropField
            id="document-remplacement"
            onFiles={(f) => void remplacerFichier(f)}
            accept={MIME_AUTORISES.join(',')}
            hint={
              replace.isPending
                ? 'Remplacement en cours…'
                : 'Dépose un nouveau fichier pour remplacer le contenu — le document garde son nom, son type et ses rattachements.'
            }
          />
        </div>
      </FormDialog>
    </Form>
  )
}
