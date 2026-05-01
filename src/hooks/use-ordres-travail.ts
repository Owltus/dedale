import { useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import { relevesKeys } from "./use-releves";
import type {
  HistoriquePoint,
  OtListItem,
  OrdreDetailComplet,
  OpExecBatchItem,
  OperationHistorique,
} from "@/lib/types/ordres-travail";

/// Toute mutation qui touche `operations_execution` ou `ordres_travail` doit invalider :
/// - les requêtes OT (listes, détails, historiques)
/// - les requêtes Relevés (la page Relevés agrège les mêmes données)
function invalidateOtAndReleves(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: otKeys.all });
  qc.invalidateQueries({ queryKey: relevesKeys.all });
}

export const otKeys = {
  all: ["ordres-travail"] as const,
  lists: () => [...otKeys.all, "list"] as const,
  byGamme: (idGamme: number) => [...otKeys.all, "gamme", idGamme] as const,
  detail: (id: number) => [...otKeys.all, "detail", id] as const,
  historique: (id: number, limit: number) =>
    [...otKeys.all, "detail", id, "historique", limit] as const,
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

/**
 * Historique des relevés des opérations mesure de l'OT, indexé par id_operation_execution.
 * `enabled` permet d'éviter la requête quand on sait qu'il n'y a aucune opération mesure.
 */
export function useOperationsHistorique(idOt: number, enabled = true, limit = 6) {
  const { data, ...rest } = useInvokeQuery<OperationHistorique[]>(
    "get_operations_historique",
    { idOt, limit },
    { queryKey: otKeys.historique(idOt, limit), enabled: !!idOt && enabled }
  );
  const byOp = useMemo<Map<number, HistoriquePoint[]>>(
    () => new Map((data ?? []).map((h) => [h.id_operation_execution, h.points])),
    [data]
  );
  return { ...rest, data: byOp };
}

export function useCreateOrdreTravail() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { input: Record<string, unknown> }>(
    "create_ordre_travail",
    { onSettled: () => invalidateOtAndReleves(qc) }
  );
}

export function useDeleteOrdreTravail() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_ordre_travail",
    { onSettled: () => invalidateOtAndReleves(qc) }
  );
}

export function useUpdateStatutOt() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { id: number; nouveauStatut: number }>(
    "update_statut_ot",
    { onSettled: () => invalidateOtAndReleves(qc) }
  );
}

export function useUpdateOrdreTravail() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { id: number; input: Record<string, unknown> }>(
    "update_ordre_travail",
    { onSettled: () => invalidateOtAndReleves(qc) }
  );
}

export function useUpdateOperationExecution() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { id: number; input: Record<string, unknown> }>(
    "update_operation_execution",
    { onSettled: () => invalidateOtAndReleves(qc) }
  );
}

export function useBulkTerminerOperations() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { ids: number[]; dateExecution: string }>(
    "bulk_terminer_operations",
    { onSettled: () => invalidateOtAndReleves(qc) }
  );
}

export function useBulkUpdateOperations() {
  const qc = useQueryClient();
  return useInvokeMutation<OrdreDetailComplet, { items: OpExecBatchItem[] }>(
    "bulk_update_operations",
    { onSettled: () => invalidateOtAndReleves(qc) }
  );
}
