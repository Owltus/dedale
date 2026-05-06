import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Document, DocumentListItem, DocumentLie, DocumentLiaison } from "@/lib/types/documents";
import type { PreviewableDoc } from "@/components/shared/DocumentPreviewDialog";
import { formatDocumentFilename } from "@/lib/utils/format";

export const documentKeys = {
  all: ["documents"] as const,
  entity: (type: string, id: number) => ["documents", "entity", type, id] as const,
  liaisons: (idDocument: number) => ["documents", "liaisons", idDocument] as const,
};

export function useDocuments() {
  return useInvokeQuery<DocumentListItem[]>("get_documents", undefined, { queryKey: documentKeys.all });
}

export function useDocumentsForEntity(entityType: string, entityId: number) {
  return useInvokeQuery<DocumentLie[]>(
    "get_documents_for_entity",
    { entityType, entityId },
    { queryKey: documentKeys.entity(entityType, entityId), enabled: !!entityId }
  );
}

/// Liste les entités auxquelles un document est lié (tous types confondus).
/// staleTime long : les liaisons changent rarement et les mutations link_/unlink_
/// invalident déjà la racine ["documents"], ce qui couvre cette clé.
export function useDocumentLiaisons(idDocument: number, options?: { enabled?: boolean }) {
  return useInvokeQuery<DocumentLiaison[]>(
    "get_document_liaisons",
    { idDocument },
    {
      queryKey: documentKeys.liaisons(idDocument),
      enabled: !!idDocument && (options?.enabled ?? true),
      staleTime: 5 * 60 * 1000,
    }
  );
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useInvokeMutation<Document, { input: { nom_original: string; data_base64: string; id_type_document: number } }>(
    "upload_document",
    { onSettled: () => qc.invalidateQueries({ queryKey: documentKeys.all }) }
  );
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useInvokeMutation<Document, { id: number; nom_original?: string; id_type_document?: number }>(
    "update_document",
    { onSettled: () => qc.invalidateQueries({ queryKey: documentKeys.all }) }
  );
}

export function useReplaceDocumentFile() {
  const qc = useQueryClient();
  return useInvokeMutation<Document, { id: number; data_base64: string }>(
    "replace_document_file",
    { onSettled: () => qc.invalidateQueries({ queryKey: documentKeys.all }) }
  );
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_document",
    { onSettled: () => qc.invalidateQueries({ queryKey: documentKeys.all }) }
  );
}

export function useDownloadDocument() {
  return useInvokeMutation<string, { id: number }>("download_document");
}

/// État partagé pour DocumentPreviewDialog : ouvre la modale en "Chargement"
/// dès le clic, puis remplit la donnée quand le téléchargement répond
export function useDocumentPreview() {
  const [previewDoc, setPreviewDoc] = useState<PreviewableDoc | null>(null);
  const [previewData, setPreviewData] = useState<string | null>(null);
  const downloadMutation = useDownloadDocument();

  const openPreview = useCallback(async (doc: PreviewableDoc) => {
    setPreviewDoc(doc);
    setPreviewData(null);
    try {
      const base64 = await downloadMutation.mutateAsync({ id: doc.id_document });
      setPreviewData(base64);
    } catch {
      setPreviewDoc(null);
      setPreviewData(null);
    }
  }, [downloadMutation]);

  const closePreview = useCallback(() => {
    setPreviewDoc(null);
    setPreviewData(null);
  }, []);

  return { previewDoc, previewData, openPreview, closePreview };
}

export function useSaveDocumentToDisk() {
  return useCallback(async (doc: { id_document: number; nom_original: string; extension: string }) => {
    try {
      const defaultPath = formatDocumentFilename(doc.nom_original, doc.extension);
      const destination = await save({ defaultPath, title: "Enregistrer le document" });
      if (!destination) return;
      await invoke("save_document_to", { id: doc.id_document, destination });
      toast.success("Document enregistré");
    } catch (err) {
      toast.error(`Téléchargement échoué : ${String(err)}`);
    }
  }, []);
}


