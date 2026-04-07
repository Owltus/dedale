import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { ModeleOperation, ModeleOperationItem } from "@/lib/types/gammes";

export const modeleOperationKeys = {
  all: ["modeles_operations"] as const,
  detail: (id: number) => [...modeleOperationKeys.all, "detail", id] as const,
  items: (idModeleOperation: number) => [...modeleOperationKeys.all, "items", idModeleOperation] as const,
};

// --- Modèles d'opérations ---

export function useModelesOperations() {
  return useInvokeQuery<ModeleOperation[]>("get_modeles_operations", undefined, { queryKey: modeleOperationKeys.all });
}

export function useModeleOperation(id: number) {
  return useInvokeQuery<ModeleOperation>("get_modele_operation", { id }, { queryKey: modeleOperationKeys.detail(id), enabled: !!id });
}

export function useCreateModeleOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<ModeleOperation, { input: Record<string, unknown> }>(
    "create_modele_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleOperationKeys.all }) }
  );
}

export function useUpdateModeleOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<ModeleOperation, { id: number; input: Record<string, unknown> }>(
    "update_modele_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleOperationKeys.all }) }
  );
}

export function useDeleteModeleOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_modele_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleOperationKeys.all }) }
  );
}

// --- Items d'un modèle d'opération ---

export function useModeleOperationItems(idModeleOperation: number) {
  return useInvokeQuery<ModeleOperationItem[]>(
    "get_modele_operation_items",
    { idModeleOperation },
    { queryKey: modeleOperationKeys.items(idModeleOperation), enabled: !!idModeleOperation }
  );
}

export function useCreateModeleOperationItem() {
  const qc = useQueryClient();
  return useInvokeMutation<ModeleOperationItem, { input: Record<string, unknown> }>(
    "create_modele_operation_item",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleOperationKeys.all }) }
  );
}

export function useUpdateModeleOperationItem() {
  const qc = useQueryClient();
  return useInvokeMutation<ModeleOperationItem, { id: number; input: Record<string, unknown> }>(
    "update_modele_operation_item",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleOperationKeys.all }) }
  );
}

export function useDeleteModeleOperationItem() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_modele_operation_item",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleOperationKeys.all }) }
  );
}
