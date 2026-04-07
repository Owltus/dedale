import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Document, DocumentAggrege, DocumentListItem, DocumentLie } from "@/lib/types/documents";

export const documentKeys = {
  all: ["documents"] as const,
  entity: (type: string, id: number) => ["documents", "entity", type, id] as const,
};

export function useDocumentsPrestataire(idPrestataire: number) {
  return useInvokeQuery<DocumentAggrege[]>(
    "get_documents_prestataire_agregat",
    { idPrestataire },
    { queryKey: [...documentKeys.all, "prestataire", idPrestataire] as const, enabled: !!idPrestataire },
  );
}

export function useDocumentsEquipement(idEquipement: number) {
  return useInvokeQuery<DocumentAggrege[]>(
    "get_documents_equipement_agregat",
    { idEquipement },
    { queryKey: [...documentKeys.all, "equipement", idEquipement] as const, enabled: !!idEquipement },
  );
}

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


