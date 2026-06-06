import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { typesDocumentsQueries } from '../queries'
import { ACCEPT_FICHIER, validerFichier } from '../upload'
import { useAuth } from '@/auth'
import { errorMessage } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/common/select-field'

interface UploadDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  title?: string
  description?: string
  /**
   * Réalise l'upload (étapes a+b, et c si rattachement). Reçoit le fichier,
   * le type choisi et l'id de l'utilisateur. Doit rejeter en cas d'échec.
   */
  onUpload: (params: {
    file: File
    uploadedBy: string
    typeDocumentId: number
  }) => Promise<unknown>
  pending: boolean
}

/** Dialogue d'upload réutilisable : choix du fichier + type, validation front. */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  title = 'Ajouter un document',
  description = 'PDF ou WebP, 20 Mo maximum.',
  onUpload,
  pending,
}: UploadDocumentDialogProps) {
  const { session } = useAuth()
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())
  const [file, setFile] = useState<File | null>(null)
  const [typeId, setTypeId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  function pickFile(next: File | null) {
    if (next) {
      const invalide = validerFichier(next)
      if (invalide) {
        setError(invalide)
        setFile(null)
        return
      }
    }
    setError(null)
    setFile(next)
  }

  async function handleSubmit() {
    if (!file) {
      setError('Sélectionne un fichier.')
      return
    }
    if (!typeId) {
      setError('Choisis un type de document.')
      return
    }
    const invalide = validerFichier(file)
    if (invalide) {
      setError(invalide)
      return
    }
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    try {
      await onUpload({
        file,
        uploadedBy: session.user.id,
        typeDocumentId: Number(typeId),
      })
      toast.success('Document ajouté')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="document-fichier">Fichier *</Label>
            <Input
              id="document-fichier"
              type="file"
              accept={ACCEPT_FICHIER}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <SelectField
            label="Type de document"
            required
            value={typeId}
            onChange={setTypeId}
          >
            <option value="">Sélectionne un type</option>
            {types.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.nom}
              </option>
            ))}
          </SelectField>
          {error && <p className="text-destructive text-sm">{error}</p>}
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
              {pending ? 'Envoi…' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
