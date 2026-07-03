import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2 } from 'lucide-react'
import { documentsQueries } from '../queries'
import type { DocumentMeta } from '../format'
import { ErrorState } from '@/components/common/error-state'
import { Button } from '@/components/ui/button'
import { DialogShell } from '@/components/common/dialog-shell'

interface DocumentPreviewDialogProps {
  /** Document à prévisualiser ; `null` = dialogue fermé. */
  doc: DocumentMeta | null
  onOpenChange: (open: boolean) => void
}

/**
 * Aperçu d'un document dans un grand dialogue (`DialogShell` plein cadre) : PDF via
 * `<iframe>`, image via `<img>`. L'URL signée (temporaire) est récupérée à
 * l'ouverture. Réutilisable partout où l'on liste des documents (via `DocumentsTab`).
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
    <DialogShell
      open={doc !== null}
      onOpenChange={onOpenChange}
      title={<span className="block truncate">{doc?.nom_original ?? 'Document'}</span>}
      description="Aperçu du document"
      headerSeparator
      headerAction={
        url ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink /> Ouvrir
          </Button>
        ) : undefined
      }
      padded={false}
      size="full"
      contentClassName="h-[85vh]"
      bodyClassName="bg-muted/40 min-h-0 flex-1"
    >
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
    </DialogShell>
  )
}
