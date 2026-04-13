import { useInvokeQuery } from "./useInvoke";
import type { DashboardData, PlanningEvent, SunburstGamme } from "@/lib/types/dashboard";
import type { OtListItem } from "@/lib/types/ordres-travail";

export const dashboardKeys = {
  data: ["dashboard"] as const,
  planning: (annee: number, mois: number) => ["planning", "mois", annee, mois] as const,
  semaine: (date: string) => ["planning", "semaine", date] as const,
};

export function useDashboard() {
  return useInvokeQuery<DashboardData>("get_dashboard_data", undefined, { queryKey: dashboardKeys.data });
}

export function usePlanningMois(annee: number, mois: number) {
  return useInvokeQuery<PlanningEvent[]>("get_planning_mois", { annee, mois }, { queryKey: dashboardKeys.planning(annee, mois) });
}

export function usePlanningSemaine(dateDebut: string) {
  return useInvokeQuery<PlanningEvent[]>("get_planning_semaine", { date_debut: dateDebut }, { queryKey: dashboardKeys.semaine(dateDebut), enabled: !!dateDebut });
}

export function useDonutOt(categorie: string) {
  return useInvokeQuery<OtListItem[]>("get_donut_ot", { categorie }, {
    queryKey: ["donut-ot", categorie],
    enabled: !!categorie,
  });
}

export function useSunburstGammes() {
  return useInvokeQuery<SunburstGamme[]>("get_sunburst_gammes", undefined, { queryKey: ["sunburst-gammes"] });
}

export function usePlanningAnnee(annee: number) {
  return useInvokeQuery<PlanningEvent[]>("get_planning_annee", { annee }, { queryKey: ["planning", "annee", annee] });
}
