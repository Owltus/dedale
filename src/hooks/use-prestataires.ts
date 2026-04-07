import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Prestataire } from "@/lib/types/prestataires";

export const prestataireKeys = {
  all: ["prestataires"] as const,
  detail: (id: number) => [...prestataireKeys.all, "detail", id] as const,
};

export function usePrestataires() {
  return useInvokeQuery<Prestataire[]>("get_prestataires", undefined, { queryKey: prestataireKeys.all });
}

export function usePrestataire(id: number) {
  return useInvokeQuery<Prestataire>("get_prestataire", { id }, { queryKey: prestataireKeys.detail(id), enabled: !!id });
}

export function useCreatePrestataire() {
  const qc = useQueryClient();
  return useInvokeMutation<Prestataire, { input: Record<string, unknown> }>(
    "create_prestataire",
    { onSettled: () => qc.invalidateQueries({ queryKey: prestataireKeys.all }) }
  );
}

export function useUpdatePrestataire() {
  const qc = useQueryClient();
  return useInvokeMutation<Prestataire, { id: number; input: Record<string, unknown> }>(
    "update_prestataire",
    { onSettled: () => qc.invalidateQueries({ queryKey: prestataireKeys.all }) }
  );
}

export function useDeletePrestataire() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_prestataire",
    { onSettled: () => qc.invalidateQueries({ queryKey: prestataireKeys.all }) }
  );
}
