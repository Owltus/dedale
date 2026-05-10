import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Plus } from "lucide-react";
import { DocumentIcon } from "@/components/shared/DocumentIcon";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CardList } from "@/components/shared/CardList";
import { DropZone } from "@/components/shared/DropZone";
import { ActionButtons } from "@/components/shared/ActionButtons";
import { UploadModal } from "@/components/shared/UploadModal";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { DocumentPreviewDialog, type PreviewableDoc } from "@/components/shared/DocumentPreviewDialog";
import { DocumentLiaisonsButton } from "@/components/shared/DocumentLiaisonsButton";
import { DocumentEditDialog } from "@/components/shared/DocumentEditDialog";
import { Button } from "@/components/ui/button";
import type { DocumentListItem } from "@/lib/types/documents";
import {
  useDocuments, useDeleteDocument,
  useSaveDocumentToDisk, useDocumentPreview,
} from "@/hooks/use-documents";
import { formatDate, formatBytes } from "@/lib/utils/format";

function filterDocument(doc: DocumentListItem, q: string): boolean {
  return doc.nom_original.toLowerCase().includes(q) || doc.nom_type.toLowerCase().includes(q);
}

export function Documents() {
  const { data: documents = [] } = useDocuments();
  const { enqueue } = useUploadQueue();
  const deleteMutation = useDeleteDocument();
  const saveToDisk = useSaveDocumentToDisk();
  const { previewDoc, previewData, openPreview, closePreview } = useDocumentPreview();

  // ── Dialog states ──
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<{ name: string; base64: string }[]>();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editDoc, setEditDoc] = useState<DocumentListItem | null>(null);

  // ── Handlers ──

  const handleDroppedFiles = useCallback(async (files: { name: string; base64: string }[]) => {
    if (!uploadOpen) {
      setDroppedFiles(files);
      setUploadOpen(true);
    }
  }, [uploadOpen]);

  const handleDownload = (doc: PreviewableDoc) => saveToDisk(doc);

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast.success("Document supprime");
      setDeleteId(null);
    } catch { /* gere */ }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Documents">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Ajouter des documents" onClick={() => setUploadOpen(true)} />
        </TooltipProvider>
      </PageHeader>

      <DropZone
        onFilesDropped={handleDroppedFiles}
        disabled={uploadOpen}
        className="flex flex-1 flex-col rounded-md border min-h-0"
      >
        <CardList
          data={documents}
          getKey={(doc) => doc.id_document}
          onItemClick={openPreview}
          filterFn={filterDocument}
          icon={<FileText className="size-5 text-muted-foreground" />}
          getIcon={(doc) => <DocumentIcon extension={doc.extension} />}
          title="Documents"
          emptyTitle="Aucun document"
          emptyDescription="Ajoutez des documents ou glissez-deposez des fichiers ici."
          getIconOverlay={(doc) => doc.nb_liaisons > 0 && (
            <DocumentLiaisonsButton idDocument={doc.id_document} nbLiaisons={doc.nb_liaisons} />
          )}
          renderContent={(doc) => (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.nom_original}</p>
              <p className="text-xs text-muted-foreground truncate">
                {doc.nom_type} · {formatBytes(doc.taille_octets)} · {formatDate(doc.date_upload)}
              </p>
            </div>
          )}
          renderRight={(doc) => (
            <ActionButtons
              onEdit={() => setEditDoc(doc)}
              onDelete={() => setDeleteId(doc.id_document)}
              extra={
                <Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}>
                  <Download className="size-3.5" />
                </Button>
              }
            />
          )}
        />
      </DropZone>

      <UploadModal
        open={uploadOpen}
        onOpenChange={(v) => { setUploadOpen(v); if (!v) setDroppedFiles(undefined); }}
        onUpload={enqueue}
        initialFiles={droppedFiles}
      />

      <DocumentEditDialog doc={editDoc} onClose={() => setEditDoc(null)} />

      <DocumentPreviewDialog
        doc={previewDoc}
        previewData={previewData}
        onClose={closePreview}
        onDownload={handleDownload}
      />

      <ConfirmDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}
        title="Supprimer le document" description="Le fichier sera supprime definitivement."
        onConfirm={handleDelete} isLoading={deleteMutation.isPending} />
    </div>
  );
}
