import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { CategorieModele, ModeleEquipement, ChampModele, ValeurChampEquipement } from "@/lib/types/equipements";

export const categorieModeleKeys = {
  all: ["categories_modeles"] as const,
};

export const modeleEquipementKeys = {
  all: ["modeles_equipements"] as const,
  detail: (id: number) => [...modeleEquipementKeys.all, "detail", id] as const,
  champs: (id: number) => [...modeleEquipementKeys.all, "champs", id] as const,
  valeurs: (idEquipement: number) => [...modeleEquipementKeys.all, "valeurs", idEquipement] as const,
};

// --- Catégories de modèles ---

export function useCategoriesModeles() {
  return useInvokeQuery<CategorieModele[]>("get_categories_modeles", undefined, {
    queryKey: categorieModeleKeys.all,
    staleTime: Infinity,
  });
}

export function useCreateCategorieModele() {
  const qc = useQueryClient();
  return useInvokeMutation<CategorieModele, { input: { nom_categorie: string; description?: string } }>(
    "create_categorie_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: categorieModeleKeys.all }) }
  );
}

export function useUpdateCategorieModele() {
  const qc = useQueryClient();
  return useInvokeMutation<CategorieModele, { id: number; input: { nom_categorie: string; description?: string } }>(
    "update_categorie_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: categorieModeleKeys.all }) }
  );
}

export function useDeleteCategorieModele() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_categorie_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: categorieModeleKeys.all }) }
  );
}

// --- Modèles d'équipement ---

export function useModelesEquipements() {
  return useInvokeQuery<ModeleEquipement[]>("get_modeles_equipements", undefined, { queryKey: modeleEquipementKeys.all });
}

export function useModeleEquipement(id: number) {
  return useInvokeQuery<ModeleEquipement>("get_modele_equipement", { id }, { queryKey: modeleEquipementKeys.detail(id), enabled: !!id });
}

export function useCreateModeleEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<ModeleEquipement, { input: Record<string, unknown> }>(
    "create_modele_equipement",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}

export function useUpdateModeleEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<ModeleEquipement, { id: number; input: Record<string, unknown> }>(
    "update_modele_equipement",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}

export function useDeleteModeleEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_modele_equipement",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}

// --- Champs d'un modèle ---

export function useChampsModele(idModeleEquipement: number) {
  return useInvokeQuery<ChampModele[]>(
    "get_champs_modele",
    { idModeleEquipement },
    { queryKey: modeleEquipementKeys.champs(idModeleEquipement), enabled: !!idModeleEquipement }
  );
}

export function useCreateChampModele() {
  const qc = useQueryClient();
  return useInvokeMutation<ChampModele, { input: Record<string, unknown> }>(
    "create_champ_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}

export function useUpdateChampModele() {
  const qc = useQueryClient();
  return useInvokeMutation<ChampModele, { id: number; input: Record<string, unknown> }>(
    "update_champ_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}

export function useArchiveChampModele() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "archive_champ_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}

export function useDeleteChampModele() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_champ_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}

// --- Valeurs d'un équipement ---

export function useValeursEquipement(idEquipement: number) {
  return useInvokeQuery<ValeurChampEquipement[]>(
    "get_valeurs_equipement",
    { idEquipement },
    { queryKey: modeleEquipementKeys.valeurs(idEquipement), enabled: !!idEquipement }
  );
}

export function useSaveValeursEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idEquipement: number; valeurs: { id_champ: number; valeur: string | null }[] }>(
    "save_valeurs_equipement",
    { onSettled: () => qc.invalidateQueries({ queryKey: modeleEquipementKeys.all }) }
  );
}
