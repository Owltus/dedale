import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { DomaineGamme, DomaineGammeListItem, FamilleGamme, FamilleGammeListItem, Gamme, GammeListItem, Operation } from "@/lib/types/gammes";
import type { Equipement } from "@/lib/types/equipements";

// ── Query keys ──

export const gammeKeys = {
  all: ["gammes"] as const,
  list: (idFamilleGamme?: number) => idFamilleGamme ? ["gammes", { id_famille_gamme: idFamilleGamme }] as const : ["gammes"] as const,
  detail: (id: number) => [...gammeKeys.all, "detail", id] as const,
  operations: (idGamme: number) => [...gammeKeys.all, "operations", idGamme] as const,
  modeles: (idGamme: number) => [...gammeKeys.all, "modeles", idGamme] as const,
  equipements: (idGamme: number) => [...gammeKeys.all, "equipements", idGamme] as const,
  domainesGammes: ["domaines-gammes"] as const,
  domaineGamme: (id: number) => ["domaines-gammes", "detail", id] as const,
  famillesGammes: (idDomaine?: number) => idDomaine ? ["familles-gammes", { id_domaine_gamme: idDomaine }] as const : ["familles-gammes"] as const,
  familleGamme: (id: number) => ["familles-gammes", "detail", id] as const,
};

// ── Domaines gammes ──

export function useDomainesGammes() {
  return useInvokeQuery<DomaineGamme[]>(
    "get_domaines_gammes",
    undefined,
    { queryKey: gammeKeys.domainesGammes },
  );
}

export function useDomainesGammesList() {
  return useInvokeQuery<DomaineGammeListItem[]>(
    "get_domaines_gammes_list",
    undefined,
    { queryKey: [...gammeKeys.domainesGammes, "list"] as const },
  );
}

export function useDomaineGamme(id: number) {
  return useInvokeQuery<DomaineGamme>(
    "get_domaine_gamme",
    { id },
    { queryKey: gammeKeys.domaineGamme(id), enabled: !!id },
  );
}

export function useCreateDomaineGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<DomaineGamme, { input: Record<string, unknown> }>(
    "create_domaine_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.domainesGammes }) },
  );
}

export function useUpdateDomaineGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<DomaineGamme, { id: number; input: Record<string, unknown> }>(
    "update_domaine_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.domainesGammes }) },
  );
}

export function useDeleteDomaineGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_domaine_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.domainesGammes }) },
  );
}

// ── Familles gammes ──

export function useFamillesGammes(idDomaineGamme?: number) {
  return useInvokeQuery<FamilleGamme[]>(
    "get_familles_gammes",
    idDomaineGamme ? { idDomaineGamme } : undefined,
    { queryKey: gammeKeys.famillesGammes(idDomaineGamme) },
  );
}

export function useFamillesGammesList(idDomaineGamme: number) {
  return useInvokeQuery<FamilleGammeListItem[]>(
    "get_familles_gammes_list",
    { idDomaineGamme },
    { queryKey: [...gammeKeys.famillesGammes(idDomaineGamme), "list"] as const, enabled: !!idDomaineGamme },
  );
}

export function useFamilleGamme(id: number) {
  return useInvokeQuery<FamilleGamme>(
    "get_famille_gamme",
    { id },
    { queryKey: gammeKeys.familleGamme(id), enabled: !!id },
  );
}

export function useCreateFamilleGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<FamilleGamme, { input: Record<string, unknown> }>(
    "create_famille_gamme",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["familles-gammes"] }); } },
  );
}

export function useUpdateFamilleGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<FamilleGamme, { id: number; input: Record<string, unknown> }>(
    "update_famille_gamme",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["familles-gammes"] }); } },
  );
}

export function useDeleteFamilleGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_famille_gamme",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["familles-gammes"] }); } },
  );
}

// ── Gammes ──

export function useGammes(idFamilleGamme?: number) {
  return useInvokeQuery<GammeListItem[]>(
    "get_gammes",
    idFamilleGamme ? { idFamilleGamme } : undefined,
    { queryKey: gammeKeys.list(idFamilleGamme) },
  );
}

export function useGamme(id: number) {
  return useInvokeQuery<Gamme>("get_gamme", { id }, { queryKey: gammeKeys.detail(id), enabled: !!id });
}

export function useCreateGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<Gamme, { input: Record<string, unknown> }>(
    "create_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useUpdateGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<Gamme, { id: number; input: Record<string, unknown> }>(
    "update_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useDeleteGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useToggleGammeActive() {
  const qc = useQueryClient();
  return useInvokeMutation<Gamme, { id: number; estActive: number }>(
    "toggle_gamme_active",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

// ── Opérations ──

export function useOperations(idGamme: number) {
  return useInvokeQuery<Operation[]>(
    "get_operations",
    { idGamme },
    { queryKey: gammeKeys.operations(idGamme), enabled: !!idGamme }
  );
}

export function useCreateOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<Operation, { input: Record<string, unknown> }>(
    "create_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useUpdateOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<Operation, { id: number; input: Record<string, unknown> }>(
    "update_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useDeleteOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

// ── Modèles de gamme (liaison gamme ↔ modèle d'opération) ──

export function useGammeModeles(idGamme: number) {
  return useInvokeQuery<number[]>(
    "get_gamme_modeles",
    { idGamme },
    { queryKey: gammeKeys.modeles(idGamme), enabled: !!idGamme }
  );
}

export function useLinkModeleOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idGamme: number; idModeleOperation: number }>(
    "link_modele_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useUnlinkModeleOperation() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idGamme: number; idModeleOperation: number }>(
    "unlink_modele_operation",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

// ── Liaison gammes ↔ équipements (N↔N) ──

export function useGammeEquipements(idGamme: number) {
  return useInvokeQuery<Equipement[]>(
    "get_gamme_equipements",
    { idGamme },
    { queryKey: gammeKeys.equipements(idGamme), enabled: !!idGamme }
  );
}

export function useLinkGammeEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idGamme: number; idEquipement: number }>(
    "link_gamme_equipement",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useLinkGammeEquipementsBatch() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idGamme: number; idEquipements: number[] }>(
    "link_gamme_equipements_batch",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useUnlinkGammeEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idGamme: number; idEquipement: number }>(
    "unlink_gamme_equipement",
    { onSettled: () => qc.invalidateQueries({ queryKey: gammeKeys.all }) }
  );
}

export function useEquipementGammes(idEquipement: number) {
  return useInvokeQuery<GammeListItem[]>(
    "get_equipement_gammes",
    { idEquipement },
    { queryKey: ["equipements", "gammes", idEquipement], enabled: !!idEquipement }
  );
}
