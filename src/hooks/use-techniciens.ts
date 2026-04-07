import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Technicien } from "@/lib/types/techniciens";
import type { OtListItem } from "@/lib/types/ordres-travail";

export const technicienKeys = {
  all: ["techniciens"] as const,
  detail: (id: number) => [...technicienKeys.all, "detail", id] as const,
};

export function useTechniciens() {
  return useInvokeQuery<Technicien[]>("get_techniciens", undefined, { queryKey: technicienKeys.all });
}

export function useTechnicien(id: number) {
  return useInvokeQuery<Technicien>("get_technicien", { id }, { queryKey: technicienKeys.detail(id), enabled: !!id });
}

export function useCreateTechnicien() {
  const qc = useQueryClient();
  return useInvokeMutation<Technicien, { input: { nom: string; prenom: string; telephone?: string; email?: string; id_poste?: number | null; est_actif: number } }>(
    "create_technicien",
    { onSettled: () => qc.invalidateQueries({ queryKey: technicienKeys.all }) }
  );
}

export function useUpdateTechnicien() {
  const qc = useQueryClient();
  return useInvokeMutation<Technicien, { id: number; input: { nom: string; prenom: string; telephone?: string; email?: string; id_poste?: number | null; est_actif: number } }>(
    "update_technicien",
    { onSettled: () => qc.invalidateQueries({ queryKey: technicienKeys.all }) }
  );
}

export function useDeleteTechnicien() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_technicien",
    { onSettled: () => qc.invalidateQueries({ queryKey: technicienKeys.all }) }
  );
}

export function useOtByTechnicien(idTechnicien: number) {
  return useInvokeQuery<OtListItem[]>(
    "get_ot_by_technicien",
    { idTechnicien },
    { queryKey: [...technicienKeys.detail(idTechnicien), "ot"] as const, enabled: !!idTechnicien },
  );
}
