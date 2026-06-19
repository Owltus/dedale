import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2 } from 'lucide-react'
import { documentsQueries } from '../queries'
import type { DocumentMeta } from '../format'
import { ErrorState } from '@/components/common/error-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DocumentPreviewDialogProps {
  /** Document à prévisualiser ; `null` = dialogue fermé. */
  doc: DocumentMeta | null
  onOpenChange: (open: boolean) => void
}

/**
 * Aperçu d'un document dans un grand dialogue : PDF via `<iframe>`, image via
 * `<img>`. L'URL signée (temporaire) est récupérée à l'ouverture. Réutilisable
 * partout où l'on liste des documents (via `DocumentsTab`).
 */
export function DocumentPreviewDialog({
  doc,
  onOpenChange,
}: DocumentPreviewDialogProps) {
  const {
    data: url,
    isError,
    refetch,
  } = useQuery({
    ...documentsQueries.signedUrl(doc?.storage_path ?? ''),
    enabled: doc !== null,
  })

  return (
    <Dialog open={doc !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0 border-b px-4 py-3 pr-12 text-left">
          <div className="min-w-0">
            <DialogTitle className="truncate">
              {doc?.nom_original ?? 'Document'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Aperçu du document
            </DialogDescription>
          </div>
          {url && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink /> Ouvrir
            </Button>
          )}
        </DialogHeader>

        <div className="bg-muted/40 min-h-0 flex-1">
          {doc !== null &&
            (isError ? (
              <div className="flex h-full items-center justify-center p-6">
                <ErrorState onRetry={() => void refetch()} />
              </div>
            ) : !url ? (
              <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                <Loader2 className="size-5 animate-spin" />
                Chargement de l'aperçu…
              </div>
            ) : doc.mime_type === 'application/pdf' ? (
              <iframe
                title={doc.nom_original}
                src={url}
                className="h-full w-full border-0"
              />
            ) : doc.mime_type.startsWith('image/') ? (
              <div className="flex h-full items-center justify-center p-4">
                <img
                  src={url}
                  alt={doc.nom_original}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
                Aperçu non disponible pour ce format.
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
