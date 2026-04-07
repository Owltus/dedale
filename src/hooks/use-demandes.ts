import { useQueryClient } from "@tanstack/react-query";
import { useInvokeQuery, useInvokeMutation } from "./useInvoke";
import type { DemandeIntervention, DiEquipementInfo, DiListItem } from "@/lib/types/demandes";

export const diKeys = {
  all: ["demandes"] as const,
  detail: (id: number) => [...diKeys.all, "detail", id] as const,
  localisations: (id: number) => [...diKeys.all, "localisations", id] as const,
  equipements: (id: number) => [...diKeys.all, "equipements", id] as const,
};

export function useDemandes() {
  return useInvokeQuery<DiListItem[]>("get_demandes", undefined, { queryKey: diKeys.all });
}

export function useDemande(id: number) {
  return useInvokeQuery<DemandeIntervention>("get_demande", { id }, { queryKey: diKeys.detail(id), enabled: !!id });
}

export function useCreateDemande() {
  const qc = useQueryClient();
  return useInvokeMutation<DemandeIntervention, { input: Record<string, unknown> }>(
    "create_demande",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useUpdateDemande() {
  const qc = useQueryClient();
  return useInvokeMutation<DemandeIntervention, { id: number; input: Record<string, unknown> }>(
    "update_demande",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useDeleteDemande() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { id: number }>(
    "delete_demande",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useResoudreDemande() {
  const qc = useQueryClient();
  return useInvokeMutation<DemandeIntervention, { id: number; input: { date_resolution: string; description_resolution: string } }>(
    "resoudre_demande",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useReouvrirDemande() {
  const qc = useQueryClient();
  return useInvokeMutation<DemandeIntervention, { id: number }>(
    "reouvrir_demande",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useRepasserOuverteDemande() {
  const qc = useQueryClient();
  return useInvokeMutation<DemandeIntervention, { id: number }>(
    "repasser_ouverte_demande",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useCreateDemandeFromModele() {
  const qc = useQueryClient();
  return useInvokeMutation<DemandeIntervention, { idModeleDi: number }>(
    "create_demande_from_modele",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useDiLocalisations(idDi: number) {
  return useInvokeQuery<number[]>("get_di_localisations", { idDi }, { queryKey: diKeys.localisations(idDi), enabled: !!idDi });
}

export function useLinkDiGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idDi: number; idGamme: number }>(
    "link_di_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useUnlinkDiGamme() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idDi: number; idGamme: number }>(
    "unlink_di_gamme",
    { onSettled: () => qc.invalidateQueries({ queryKey: diKeys.all }) }
  );
}

export function useLinkDiLocalisation() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idDi: number; idLocal: number }>(
    "link_di_localisation",
    { onSettled: (_d, _e, vars) => { qc.invalidateQueries({ queryKey: diKeys.all }); qc.invalidateQueries({ queryKey: diKeys.localisations(vars.idDi) }); } }
  );
}

export function useUnlinkDiLocalisation() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idDi: number; idLocal: number }>(
    "unlink_di_localisation",
    { onSettled: (_d, _e, vars) => { qc.invalidateQueries({ queryKey: diKeys.all }); qc.invalidateQueries({ queryKey: diKeys.localisations(vars.idDi) }); } }
  );
}

export function useDiEquipements(idDi: number) {
  return useInvokeQuery<DiEquipementInfo[]>("get_di_equipements", { idDi }, { queryKey: diKeys.equipements(idDi), enabled: !!idDi });
}

export function useLinkDiEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idDi: number; idEquipement: number }>(
    "link_di_equipement",
    { onSettled: (_d, _e, vars) => { qc.invalidateQueries({ queryKey: diKeys.all }); qc.invalidateQueries({ queryKey: diKeys.equipements(vars.idDi) }); } }
  );
}

export function useUnlinkDiEquipement() {
  const qc = useQueryClient();
  return useInvokeMutation<null, { idDi: number; idEquipement: number }>(
    "unlink_di_equipement",
    { onSettled: (_d, _e, vars) => { qc.invalidateQueries({ queryKey: diKeys.all }); qc.invalidateQueries({ queryKey: diKeys.equipements(vars.idDi) }); } }
  );
}
