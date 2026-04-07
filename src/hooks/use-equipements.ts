import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { Domaine, DomaineEquipListItem, Famille, FamilleEquipListItem, Equipement, EquipementListItem } from "@/lib/types/equipements";
import type { OtListItem } from "@/lib/types/ordres-travail";

export const equipementKeys = {
  domaines: ["domaines"] as const,
  domaine: (id: number) => ["domaines", "detail", id] as const,
  familles: (idDomaine?: number) => idDomaine ? ["familles", { id_domaine: idDomaine }] as const : ["familles"] as const,
  famille: (id: number) => ["familles", "detail", id] as const,
  equipements: (idFamille?: number) => idFamille ? ["equipements", { id_famille: idFamille }] as const : ["equipements"] as const,
  equipement: (id: number) => ["equipements", "detail", id] as const,
  otByEquipement: (id: number) => ["equipements", "ot", id] as const,
};

// Domaines
export function useDomaines() {
  return useInvokeQuery<Domaine[]>("get_domaines", undefined, { queryKey: equipementKeys.domaines });
}
export function useDomainesEquipList() {
  return useInvokeQuery<DomaineEquipListItem[]>("get_domaines_equip_list", undefined, { queryKey: [...equipementKeys.domaines, "list"] as const });
}
export function useDomaine(id: number) {
  return useInvokeQuery<Domaine>("get_domaine", { id }, { queryKey: equipementKeys.domaine(id), enabled: !!id });
}
export function useCreateDomaine() {
  const qc = useQueryClient();
  return useInvokeMutation<Domaine, { input: { nom_domaine: string; description?: string; id_image?: number | null } }>(
    "create_domaine",
    { onSettled: () => qc.invalidateQueries({ queryKey: equipementKeys.domaines }) }
  );
}
export function useUpdateDomaine() {
  const qc = useQueryClient();
  return useInvokeMutation<Domaine, { id: number; input: { nom_domaine: string; description?: string; id_image?: number | null } }>(
    "update_domaine",
    { onSettled: () => qc.invalidateQueries({ queryKey: equipementKeys.domaines }) }
  );
}
export function useDeleteDomaine() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_domaine",
    { onSettled: () => qc.invalidateQueries({ queryKey: equipementKeys.domaines }) }
  );
}

// Familles
export function useFamillesEquipList(idDomaine: number) {
  return useInvokeQuery<FamilleEquipListItem[]>("get_familles_equip_list", { idDomaine }, { queryKey: [...equipementKeys.familles(idDomaine), "list"] as const, enabled: !!idDomaine });
}
export function useFamille(id: number) {
  return useInvokeQuery<Famille>("get_famille", { id }, { queryKey: equipementKeys.famille(id), enabled: !!id });
}
export function useFamilles(idDomaine?: number) {
  return useInvokeQuery<Famille[]>(
    "get_familles",
    idDomaine ? { idDomaine } : undefined,
    { queryKey: equipementKeys.familles(idDomaine) },
  );
}
export function useCreateFamille() {
  const qc = useQueryClient();
  return useInvokeMutation<Famille, { input: { nom_famille: string; description?: string; id_domaine: number; id_image?: number | null } }>(
    "create_famille",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["familles"] }); } }
  );
}
export function useUpdateFamille() {
  const qc = useQueryClient();
  return useInvokeMutation<Famille, { id: number; input: { nom_famille: string; description?: string; id_domaine: number; id_image?: number | null } }>(
    "update_famille",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["familles"] }); } }
  );
}
export function useDeleteFamille() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_famille",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["familles"] }); } }
  );
}

// OT par équipement
export function useOtByEquipement(idEquipement: number) {
  return useInvokeQuery<OtListItem[]>("get_ot_by_equipement", { idEquipement }, {
    queryKey: equipementKeys.otByEquipement(idEquipement),
    enabled: !!idEquipement,
  });
}

// Equipements
export function useEquipements(idFamille?: number) {
  return useInvokeQuery<Equipement[]>(
    "get_equipements",
    idFamille ? { idFamille } : undefined,
    { queryKey: equipementKeys.equipements(idFamille) },
  );
}
export function useEquipementsList(idFamille: number) {
  return useInvokeQuery<EquipementListItem[]>("get_equipements_list", { idFamille }, { queryKey: [...equipementKeys.equipements(idFamille), "list"] as const, enabled: !!idFamille });
}
export function useEquipement(id: number) {
  return useInvokeQuery<Equipement>("get_equipement", { id }, { queryKey: equipementKeys.equipement(id), enabled: !!id });
}
export function useCreateEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<Equipement, { input: Record<string, unknown> }>(
    "create_equipement",
    { onSettled: () => { qc.invalidateQueries({ queryKey: ["equipements"] }); } }
  );
}
export function useUpdateEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<Equipement, { id: number; input: Record<string, unknown> }>(
    "update_equipement",
    { onSettled: () => {
      qc.invalidateQueries({ queryKey: ["equipements"] });
      // Un changement de local peut recalculer nom_localisation_calc des gammes liées (trigger SQL)
      qc.invalidateQueries({ queryKey: ["gammes"] });
    } }
  );
}
export function useDeleteEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_equipement",
    { onSettled: () => {
      qc.invalidateQueries({ queryKey: ["equipements"] });
      qc.invalidateQueries({ queryKey: ["gammes"] });
    } }
  );
}
