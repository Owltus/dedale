import { useInvokeQuery } from "./useInvoke";
import type { DashboardData, PlanningEvent } from "@/lib/types/dashboard";

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

export function usePlanningAnnee(annee: number) {
  return useInvokeQuery<PlanningEvent[]>("get_planning_annee", { annee }, { queryKey: ["planning", "annee", annee] });
}
