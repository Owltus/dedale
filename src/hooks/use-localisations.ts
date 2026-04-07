import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Batiment, Niveau, Local, LocalisationTreeNode, LocalisationFilter } from "@/lib/types/localisations";
import type { EquipementListItem, EquipementSelectItem } from "@/lib/types/equipements";
import type { GammeListItem } from "@/lib/types/gammes";
import type { OtListItem } from "@/lib/types/ordres-travail";

export const localisationKeys = {
  all: ["localisations"] as const,
  tree: () => [...localisationKeys.all, "tree"] as const,
  batiments: ["batiments"] as const,
  batiment: (id: number) => ["batiments", "detail", id] as const,
  niveaux: (idBatiment?: number) => idBatiment ? ["niveaux", { id_batiment: idBatiment }] as const : ["niveaux"] as const,
  niveau: (id: number) => ["niveaux", "detail", id] as const,
  locaux: (idNiveau?: number) => idNiveau ? ["locaux", { id_niveau: idNiveau }] as const : ["locaux"] as const,
  local: (id: number) => ["locaux", "detail", id] as const,
};

// ── Arbre aplati (pour les dropdowns gammes/équipements) ──

export function useLocalisationsTree() {
  return useInvokeQuery<LocalisationTreeNode[]>(
    "get_localisations_tree",
    undefined,
    { queryKey: localisationKeys.tree() },
  );
}

// ── Bâtiments ──

export function useBatiments() {
  return useInvokeQuery<Batiment[]>(
    "get_batiments",
    undefined,
    { queryKey: localisationKeys.batiments },
  );
}

export function useBatiment(id: number) {
  return useInvokeQuery<Batiment>(
    "get_batiment",
    { id },
    { queryKey: localisationKeys.batiment(id), enabled: !!id },
  );
}

export function useCreateBatiment() {
  const qc = useQueryClient();
  return useInvokeMutation<Batiment, { input: Record<string, unknown> }>(
    "create_batiment",
    { onSettled: () => { qc.invalidateQueries({ queryKey: localisationKeys.batiments }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

export function useUpdateBatiment() {
  const qc = useQueryClient();
  return useInvokeMutation<Batiment, { id: number; input: Record<string, unknown> }>(
    "update_batiment",
    { onSettled: () => { qc.invalidateQueries({ queryKey: localisationKeys.batiments }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

export function useDeleteBatiment() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_batiment",
    { onSettled: () => { qc.invalidateQueries({ queryKey: localisationKeys.batiments }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

// ── Niveaux ──

export function useNiveaux(idBatiment?: number) {
  return useInvokeQuery<Niveau[]>(
    "get_niveaux",
    idBatiment ? { idBatiment } : undefined,
    { queryKey: localisationKeys.niveaux(idBatiment) },
  );
}

export function useNiveau(id: number) {
  return useInvokeQuery<Niveau>(
    "get_niveau",
    { id },
    { queryKey: localisationKeys.niveau(id), enabled: !!id },
  );
}

export function useCreateNiveau() {
  const qc = useQueryClient();
  return useInvokeMutation<Niveau, { input: Record<string, unknown> }>(
    "create_niveau",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["niveaux"] }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

export function useUpdateNiveau() {
  const qc = useQueryClient();
  return useInvokeMutation<Niveau, { id: number; input: Record<string, unknown> }>(
    "update_niveau",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["niveaux"] }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

export function useDeleteNiveau() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_niveau",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["niveaux"] }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

// ── Locaux ──

export function useLocaux(idNiveau?: number) {
  return useInvokeQuery<Local[]>(
    "get_locaux",
    idNiveau ? { idNiveau } : undefined,
    { queryKey: localisationKeys.locaux(idNiveau) },
  );
}

export function useLocal(id: number) {
  return useInvokeQuery<Local>(
    "get_local",
    { id },
    { queryKey: localisationKeys.local(id), enabled: !!id },
  );
}

export function useCreateLocal() {
  const qc = useQueryClient();
  return useInvokeMutation<Local, { input: Record<string, unknown> }>(
    "create_local",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["locaux"] }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

export function useUpdateLocal() {
  const qc = useQueryClient();
  return useInvokeMutation<Local, { id: number; input: Record<string, unknown> }>(
    "update_local",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["locaux"] }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

export function useDeleteLocal() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_local",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["locaux"] }); qc.invalidateQueries({ queryKey: localisationKeys.tree() }); } },
  );
}

// ── Données liées à un local (page détail) ──

export function useEquipementsByLocal(idLocal: number) {
  return useInvokeQuery<EquipementListItem[]>(
    "get_equipements_by_local",
    { idLocal },
    { queryKey: [...localisationKeys.local(idLocal), "equipements"] as const, enabled: !!idLocal },
  );
}

export function useLocalisationFilterByFamille(idFamille: number) {
  return useInvokeQuery<LocalisationFilter>(
    "get_locaux_ids_by_famille",
    { idFamille },
    { queryKey: [...localisationKeys.all, "filter-by-famille", idFamille] as const, enabled: !!idFamille },
  );
}

export function useEquipementsByLocalAndFamille(idLocal: number, idFamille: number) {
  return useInvokeQuery<EquipementSelectItem[]>(
    "get_equipements_by_local_and_famille",
    { idLocal, idFamille },
    { queryKey: [...localisationKeys.local(idLocal), "equipements", "famille", idFamille] as const, enabled: !!idLocal && !!idFamille },
  );
}

export function useGammesByLocal(idLocal: number) {
  return useInvokeQuery<GammeListItem[]>(
    "get_gammes_by_local",
    { idLocal },
    { queryKey: [...localisationKeys.local(idLocal), "gammes"] as const, enabled: !!idLocal },
  );
}

export function useOtByLocal(idLocal: number) {
  return useInvokeQuery<OtListItem[]>(
    "get_ot_by_local",
    { idLocal },
    { queryKey: [...localisationKeys.local(idLocal), "ot"] as const, enabled: !!idLocal },
  );
}
