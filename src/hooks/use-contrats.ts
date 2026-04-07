import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Contrat, ContratListItem, ContratVersion } from "@/lib/types/contrats";

export const contratKeys = {
  all: ["contrats"] as const,
  detail: (id: number) => [...contratKeys.all, "detail", id] as const,
  versions: (id: number) => [...contratKeys.all, "versions", id] as const,
  gammes: (id: number) => [...contratKeys.all, "gammes", id] as const,
};

export function useContrats() {
  return useInvokeQuery<ContratListItem[]>("get_contrats", undefined, { queryKey: contratKeys.all });
}

export function useContrat(id: number) {
  return useInvokeQuery<Contrat>("get_contrat", { id }, { queryKey: contratKeys.detail(id), enabled: !!id });
}

export function useCreateContrat() {
  const qc = useQueryClient();
  return useInvokeMutation<Contrat, { input: Record<string, unknown> }>(
    "create_contrat",
    { onSettled: () => qc.invalidateQueries({ queryKey: contratKeys.all }) }
  );
}

export function useUpdateContrat() {
  const qc = useQueryClient();
  return useInvokeMutation<Contrat, { id: number; input: Record<string, unknown> }>(
    "update_contrat",
    { onSettled: () => qc.invalidateQueries({ queryKey: contratKeys.all }) }
  );
}

export function useDeleteContrat() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_contrat",
    { onSettled: () => qc.invalidateQueries({ queryKey: contratKeys.all }) }
  );
}

export function useResilierContrat() {
  const qc = useQueryClient();
  return useInvokeMutation<Contrat, { id: number; input: { date_notification: string; date_resiliation: string } }>(
    "resilier_contrat",
    { onSettled: () => qc.invalidateQueries({ queryKey: contratKeys.all }) }
  );
}

export function useCreateAvenant() {
  const qc = useQueryClient();
  return useInvokeMutation<Contrat, { input: Record<string, unknown> }>(
    "create_avenant",
    { onSettled: () => qc.invalidateQueries({ queryKey: contratKeys.all }) }
  );
}

export function useContratVersions(id: number) {
  return useInvokeQuery<ContratVersion[]>("get_contrat_versions", { id }, { queryKey: contratKeys.versions(id), enabled: !!id });
}

export function useContratGammes(idContrat: number) {
  return useInvokeQuery<number[]>("get_contrat_gammes", { idContrat }, { queryKey: contratKeys.gammes(idContrat), enabled: !!idContrat });
}

export function useLinkContratGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idContrat: number; idGamme: number }>(
    "link_contrat_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: ["contrats"] }) }
  );
}

export function useUnlinkContratGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idContrat: number; idGamme: number }>(
    "unlink_contrat_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: ["contrats"] }) }
  );
}
