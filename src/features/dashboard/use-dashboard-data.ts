import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { demandesQueries } from '@/features/demandes/queries'
import { documentsQueries } from '@/features/documents/queries'
import { categoriesQueries } from '@/features/categories/queries'
import { gammesQueries } from '@/features/gammes/queries'
import { OT_QUERY_KEYS } from '@/features/ordres-travail/query-keys'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import type { PlanningOt } from '@/features/planning/grille'
import { dashboardQueries } from './queries'
import { calculerKpisOt, type OtKpis } from './stats'

/**
 * Abonnements Realtime du tableau de bord — posés UNE SEULE FOIS par l'orchestrateur
 * (`dashboard.tsx`), jamais par les cadrans/listes : un appel par table, chacun
 * portant la LISTE des clés racines des features qui la présentent. Le canal
 * Supabase est déjà partagé par table par `useRealtimeRefresh` (registre module),
 * donc cette centralisation est un choix de lisibilité, pas une contrainte technique.
 *
 * Correspondance table → clés invalidées :
 * - `ordres_travail` → `OT_QUERY_KEYS` (`ordres_travail` + `planning`) + `dashboard`
 *   (pour que l'onboarding « Premiers pas » et l'alerte justificatifs se
 *   rafraîchissent aussi dès le 1er OT créé) ;
 * - `demandes_intervention` → `demandes` ; `documents` → `documents` ;
 * - `contrats` → `dashboard` (contrats à échéance + frise reconductions) ;
 * - `gammes` → `gammes` (santé du sunburst).
 */
export function useDashboardRealtime(): void {
  useRealtimeRefresh('ordres_travail', [...OT_QUERY_KEYS, dashboardQueries.all()])
  useRealtimeRefresh('demandes_intervention', demandesQueries.all())
  useRealtimeRefresh('documents', documentsQueries.all())
  useRealtimeRefresh('contrats', dashboardQueries.all())
  useRealtimeRefresh('gammes', gammesQueries.all())
}

/**
 * Hook agrégateur du tableau de bord : centralise les requêtes du site actif (OT
 * unifiés, DI, documents, catégories, gammes, counts d'onboarding, justificatifs
 * manquants) et expose des dérivations mémoïsées. Les cadrans consomment ce hook
 * plutôt que des requêtes dispersées → une seule source, un seul recalcul, et les
 * appels multiples sont dédupliqués par TanStack Query.
 *
 * Il NE pose PAS le realtime : c'est le rôle de `useDashboardRealtime`, monté une
 * seule fois par l'orchestrateur (sinon un canal par cadran → fuite).
 *
 * `siteId` peut être `null` (site non encore résolu) : chaque query est alors
 * désactivée (`enabled: siteId !== null`) et les dérivations tombent à vide.
 */
export function useDashboardData(siteId: string | null) {
  // ── Requêtes ───────────────────────────────────────────────────────────────
  // OT UNIFIÉS : alimentent à eux seuls donut + barres + sunburst (row shape
  // compatible `PlanningOt`).
  const ordresTravailQuery = useQuery(dashboardQueries.ordresTravail(siteId))
  const demandesQuery = useQuery(demandesQueries.list(siteId))
  // `documentsQueries.list` attend un `string` sans garde `enabled` → on la spread
  // et on borne l'exécution au site résolu.
  const documentsQuery = useQuery({
    ...documentsQueries.list(siteId ?? ''),
    enabled: siteId !== null,
  })
  const categoriesQuery = useQuery(categoriesQueries.list(siteId))
  const gammesQuery = useQuery(gammesQueries.list(siteId))
  const onboardingQuery = useQuery(dashboardQueries.onboarding(siteId))
  const justificatifsQuery = useQuery(
    dashboardQueries.justificatifsManquants(siteId),
  )

  // ── Dérivations mémoïsées ────────────────────────────────────────────────────
  const ordresTravail = useMemo<PlanningOt[]>(
    () => ordresTravailQuery.data ?? [],
    [ordresTravailQuery.data],
  )

  /** Compteurs du donut « Ordres de travail » (reste à faire). */
  const compteursDonut = useMemo<OtKpis>(
    () => calculerKpisOt(ordresTravail),
    [ordresTravail],
  )

  return {
    // Requêtes brutes (états loading/error consommés par l'orchestrateur).
    ordresTravailQuery,
    demandesQuery,
    documentsQuery,
    categoriesQuery,
    gammesQuery,
    onboardingQuery,
    justificatifsQuery,
    // Dérivations mémoïsées.
    ordresTravail,
    compteursDonut,
  }
}
