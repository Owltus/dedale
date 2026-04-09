import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { OtListItem, OrdreDetailComplet } from "@/lib/types/ordres-travail";

export const otKeys = {
  all: ["ordres-travail"] as const,
  lists: () => [...otKeys.all, "list"] as const,
  byGamme: (idGamme: number) => [...otKeys.all, "gamme", idGamme] as const,
  detail: (id: number) => [...otKeys.all, "detail", id] as const,
};

export function useOrdresTravail() {
  return useInvokeQuery<OtListItem[]>("get_ordres_travail", undefined, { queryKey: otKeys.lists() });
}

export function useOtByFamille(idFamille: number) {
  return useInvokeQuery<OtListItem[]>("get_ot_by_famille", { idFamille }, {
    queryKey: [...otKeys.all, "famille", idFamille] as const,
    enabled: !!idFamille,
  });
}

export function useOtByGamme(idGamme: number) {
  return useInvokeQuery<OtListItem[]>("get_ot_by_gamme", { idGamme }, {
    queryKey: otKeys.byGamme(idGamme),
    enabled: !!idGamme,
  });
}

export function useOtByIds(ids: number[]) {
  return useInvokeQuery<OtListItem[]>("get_ot_by_ids", { ids }, {
    queryKey: [...otKeys.all, "ids", ids] as const,
    enabled: ids.length > 0,
  });
}

export function useOrdreTravail(id: number) {
  return useInvokeQuery<OrdreDetailComplet>("get_ordre_travail", { id }, { queryKey: otKeys.detail(id), enabled: !!id });
}

export function useCreateOrdreTravail() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { input: Record<string, unknown> }>(
    "create_ordre_travail",
    { onSettled: () => qc.invalidateQueries({ queryKey: otKeys.all }) }
  );
}

export function useDeleteOrdreTravail() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_ordre_travail",
    { onSettled: () => qc.invalidateQueries({ queryKey: otKeys.all }) }
  );
}

export function useUpdateStatutOt() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { id: number; nouveauStatut: number }>(
    "update_statut_ot",
    { onSettled: () => qc.invalidateQueries({ queryKey: otKeys.all }) }
  );
}

export function useUpdateOrdreTravail() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { id: number; input: Record<string, unknown> }>(
    "update_ordre_travail",
    { onSettled: () => qc.invalidateQueries({ queryKey: otKeys.all }) }
  );
}

export function useUpdateOperationExecution() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { id: number; input: Record<string, unknown> }>(
    "update_operation_execution",
    { onSettled: () => qc.invalidateQueries({ queryKey: otKeys.all }) }
  );
}

export function useBulkTerminerOperations() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { ids: number[]; dateExecution: string }>(
    "bulk_terminer_operations",
    { onSettled: () => qc.invalidateQueries({ queryKey: otKeys.all }) }
  );
}
