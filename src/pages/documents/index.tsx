import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
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
import { useUploadQueue } from "@/components/shared/UploadQueue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentListItem } from "@/lib/types/documents";
import type { DocumentEditFormData } from "@/lib/schemas/documents";
import {
  useDocuments, useDeleteDocument,
  useDownloadDocument, useUpdateDocument, useReplaceDocumentFile,
} from "@/hooks/use-documents";
import { useTypesDocuments } from "@/hooks/use-referentiels";
import { formatDate, formatBytes, stripExtension } from "@/lib/utils/format";
import { fileToBase64 } from "@/components/shared/DropZone";
import { DocumentEditDialog } from "./DocumentEditDialog";
import { DocumentPreviewDialog, type PreviewableDoc } from "./DocumentPreviewDialog";

function filterDocument(doc: DocumentListItem, q: string): boolean {
  return doc.nom_original.toLowerCase().includes(q) || doc.nom_type.toLowerCase().includes(q);
}

export function Documents() {
  const { data: documents = [] } = useDocuments();
  const { data: typesDoc = [] } = useTypesDocuments();
  const { enqueue } = useUploadQueue();
  const deleteMutation = useDeleteDocument();
  const downloadMutation = useDownloadDocument();
  const updateMutation = useUpdateDocument();
  const replaceMutation = useReplaceDocumentFile();

  // ── Dialog states ──
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<{ name: string; base64: string }[]>();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editDoc, setEditDoc] = useState<DocumentListItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PreviewableDoc | null>(null);
  const [previewData, setPreviewData] = useState<string | null>(null);

  const typeItems = useMemo(
    () => Object.fromEntries(typesDoc.map((t) => [String(t.id_type_document), t.nom])),
    [typesDoc],
  );

  // ── Handlers ──

  const handleDroppedFiles = useCallback(async (files: { name: string; base64: string }[]) => {
    if (!uploadOpen) {
      setDroppedFiles(files);
      setUploadOpen(true);
    }
  }, [uploadOpen]);

  const handleDownload = async (doc: PreviewableDoc) => {
    try {
      const destination = await save({ defaultPath: doc.nom_original, title: "Enregistrer le document" });
      if (!destination) return;
      await invoke("save_document_to", { id: doc.id_document, destination });
      toast.success("Document enregistre");
    } catch (err) { toast.error(`Telechargement echoue : ${String(err)}`); }
  };

  const handlePreview = async (doc: PreviewableDoc) => {
    try {
      const base64 = await downloadMutation.mutateAsync({ id: doc.id_document });
      setPreviewData(base64);
      setPreviewDoc(doc);
    } catch { /* gere */ }
  };

  const handleEdit = async (data: DocumentEditFormData, replaceFile: File | null) => {
    if (!editDoc) return;
    try {
      if (data.nom_original !== editDoc.nom_original || data.id_type_document !== editDoc.id_type_document) {
        await updateMutation.mutateAsync({ id: editDoc.id_document, nom_original: data.nom_original, id_type_document: data.id_type_document });
      }
      if (replaceFile) {
        const base64 = await fileToBase64(replaceFile);
        await replaceMutation.mutateAsync({ id: editDoc.id_document, data_base64: base64 });
      }
      toast.success("Document modifie");
      setEditDoc(null);
    } catch { /* gere */ }
  };

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
          onItemClick={handlePreview}
          filterFn={filterDocument}
          icon={<FileText className="size-5 text-muted-foreground" />}
          getIcon={(doc) => <DocumentIcon fileName={doc.nom_original} />}
          title="Documents"
          emptyTitle="Aucun document"
          emptyDescription="Ajoutez des documents ou glissez-deposez des fichiers ici."
          renderContent={(doc) => (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{stripExtension(doc.nom_original)}</p>
              <p className="text-xs text-muted-foreground truncate">
                {doc.nom_type} · {formatBytes(doc.taille_octets)} · {formatDate(doc.date_upload)}
                {doc.nb_liaisons > 0 && <Badge variant="default" className="ml-2">{doc.nb_liaisons} lien{doc.nb_liaisons > 1 ? "s" : ""}</Badge>}
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

      <DocumentEditDialog
        doc={editDoc}
        onOpenChange={() => setEditDoc(null)}
        typesDoc={typesDoc}
        typeItems={typeItems}
        onSubmit={handleEdit}
      />

      <DocumentPreviewDialog
        doc={previewDoc}
        previewData={previewData}
        onClose={() => { setPreviewDoc(null); setPreviewData(null); }}
        onDownload={handleDownload}
      />

      <ConfirmDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}
        title="Supprimer le document" description="Le fichier sera supprime definitivement."
        onConfirm={handleDelete} isLoading={deleteMutation.isPending} />
    </div>
  );
}
