import { useInvokeQuery } from "./useInvoke";
import { useCurrentLocalDate } from "./useCurrentLocalDate";
import type { DashboardData, PlanningEvent, SunburstGamme, ContratTimelineEvent } from "@/lib/types/dashboard";
import type { OtListItem } from "@/lib/types/ordres-travail";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  data: (jour: string) => ["dashboard", "data", jour] as const,
  donutOt: (categorie: string, jour: string) => ["dashboard", "donut-ot", categorie, jour] as const,
  planning: (annee: number, mois: number) => ["planning", "mois", annee, mois] as const,
  semaine: (date: string) => ["planning", "semaine", date] as const,
};

export function useDashboard() {
  // `jour` fait partie de la clé : au passage de minuit la query est
  // automatiquement re-fetchée et les bornes de semaine ISO côté backend sont
  // recalculées (sinon le donut reste figé sur la semaine où l'app a été ouverte).
  const jour = useCurrentLocalDate();
  return useInvokeQuery<DashboardData>("get_dashboard_data", undefined, {
    queryKey: dashboardKeys.data(jour),
  });
}

export function usePlanningMois(annee: number, mois: number) {
  return useInvokeQuery<PlanningEvent[]>("get_planning_mois", { annee, mois }, { queryKey: dashboardKeys.planning(annee, mois) });
}

export function usePlanningSemaine(dateDebut: string) {
  return useInvokeQuery<PlanningEvent[]>("get_planning_semaine", { date_debut: dateDebut }, { queryKey: dashboardKeys.semaine(dateDebut), enabled: !!dateDebut });
}

export function useDonutOt(categorie: string) {
  const jour = useCurrentLocalDate();
  return useInvokeQuery<OtListItem[]>("get_donut_ot", { categorie }, {
    queryKey: dashboardKeys.donutOt(categorie, jour),
    enabled: !!categorie,
  });
}

export function useContratsTimeline() {
  return useInvokeQuery<ContratTimelineEvent[]>("get_contrats_timeline", undefined, { queryKey: ["contrats-timeline"] });
}

export function useSunburstGammes() {
  return useInvokeQuery<SunburstGamme[]>("get_sunburst_gammes", undefined, { queryKey: ["sunburst-gammes"] });
}

export function usePlanningAnnee(annee: number) {
  return useInvokeQuery<PlanningEvent[]>("get_planning_annee", { annee }, { queryKey: ["planning", "annee", annee] });
}
