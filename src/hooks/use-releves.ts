import { useInvokeQuery } from "./useInvoke";
import type { OperationReleves, RelevesGammeListItem } from "@/lib/types/releves";

export const relevesKeys = {
  all: ["releves"] as const,
  gammes: () => [...relevesKeys.all, "gammes"] as const,
  byGamme: (idGamme: number, since: string | null) =>
    [...relevesKeys.all, "by-gamme", idGamme, since] as const,
};

export function useGammesAvecReleves() {
  return useInvokeQuery<RelevesGammeListItem[]>(
    "get_gammes_avec_releves",
    undefined,
    { queryKey: relevesKeys.gammes() }
  );
}

/** `since` au format ISO `YYYY-MM-DD` ou null pour l'historique complet. */
export function useRelevesByGamme(idGamme: number, since: string | null) {
  return useInvokeQuery<OperationReleves[]>(
    "get_releves_by_gamme",
    { idGamme, since },
    { queryKey: relevesKeys.byGamme(idGamme, since), enabled: !!idGamme }
  );
}
