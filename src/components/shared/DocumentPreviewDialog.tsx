import { useEffect, useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDocumentFileType } from "@/lib/schemas/documents";
import { formatBytes } from "@/lib/utils/format";

export interface PreviewableDoc {
  id_document: number;
  nom_original: string;
  taille_octets: number;
  extension: string;
}

interface DocumentPreviewDialogProps {
  doc: PreviewableDoc | null;
  previewData: string | null;
  onClose: () => void;
  onDownload: (doc: PreviewableDoc) => void;
}

function base64ToBlobUrl(base64: string, mime: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function DocumentPreviewDialog({ doc, previewData, onClose, onDownload }: DocumentPreviewDialogProps) {
  const previewType = doc ? getDocumentFileType(doc.extension) : null;
  const mime = previewType === "pdf" ? "application/pdf" : "image/webp";

  // Dérivation directe : le blob URL est calculé à chaque changement de previewData.
  // Pas de state séparé — useMemo suffit.
  const blobUrl = useMemo(
    () => (previewData && previewType ? base64ToBlobUrl(previewData, mime) : null),
    [previewData, previewType, mime],
  );

  // Cleanup : révoquer l'URL précédente quand elle change ou au démontage.
  useEffect(() => {
    if (!blobUrl) return;
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="!max-w-[90vw] !w-[90vw] !h-[85vh] flex flex-col !p-0 !gap-0" showCloseButton>
        <DialogHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <DialogTitle>{doc?.nom_original ?? ""}</DialogTitle>
            {doc && <Badge variant="secondary">{formatBytes(doc.taille_octets)}</Badge>}
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto">
          {!previewData && (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          )}
          {blobUrl && previewType === "image" && (
            <div className="flex h-full items-center justify-center">
              <img
                src={blobUrl}
                alt={doc?.nom_original}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
          {blobUrl && previewType === "pdf" && (
            <iframe
              src={blobUrl}
              title={doc?.nom_original}
              className="h-full w-full border-0"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          {doc && (
            <Button variant="outline" size="sm" onClick={() => onDownload(doc)}>
              <Download className="mr-1 size-4" /> Télécharger
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
