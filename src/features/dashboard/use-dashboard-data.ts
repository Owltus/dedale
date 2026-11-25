import { createContext, useContext } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ajouterSemaines, isoLocale, lundiDeLaSemaine } from '@/lib/date'
import { demandesQueries } from '@/features/demandes/queries'
import { travauxQueries } from '@/features/travaux/queries'
import { evenementsQueries } from '@/features/evenements/queries'
import { categoriesQueries } from '@/features/categories/queries'
import { gammesQueries } from '@/features/gammes/queries'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import type { PlanningOt } from '@/features/planning/grille'
import { dashboardQueries } from './queries'
import { activiteQueries } from './activite-queries'

/**
 * Abonnements Realtime du tableau de bord — posés UNE SEULE FOIS par l'orchestrateur
 * (`dashboard.tsx`), jamais par les cadrans/listes : un appel par table, chacun
 * portant la LISTE des clés racines des features qui la présentent. Le canal
 * Supabase est déjà partagé par table par `useRealtimeRefresh` (registre module),
 * donc cette centralisation est un choix de lisibilité, pas une contrainte technique.
 *
 * Correspondance table → clés invalidées :
 * - `ordres_travail` → `ordres_travail` (planning compris, 3.1) + `dashboard`
 *   (pour que l'onboarding « Premiers pas » et l'alerte documents manquants se
 *   rafraîchissent aussi dès le 1er OT créé) ;
 * - `demandes_intervention` → `demandes`, `interventions_travaux` → `travaux` et
 *   `evenements` → `evenements` (les trois onglets de la carte Activité).
 *
 * Seules les tables PUBLIÉES en temps réel par la base sont écoutées (cf.
 * `TablePubliee`) : documents, contrats et gammes ne le sont pas (décision PO
 * du 24/11/2026) — leurs cartes se relisent au retour sur la page ou après une
 * écriture faite ici.
 */
export function useDashboardRealtime(): void {
  useRealtimeRefresh('ordres_travail', [
    ordresTravailQueries.all(),
    dashboardQueries.all(),
  ])
  useRealtimeRefresh('demandes_intervention', demandesQueries.all())
  useRealtimeRefresh('interventions_travaux', travauxQueries.all())
  useRealtimeRefresh('evenements', evenementsQueries.all())
}

/** Période d'OT terminés chargée par le tableau de bord : `[debut ; fin[` (ISO). */
export interface PlageOt {
  debut: string
  fin: string
}

/**
 * Demi-largeur minimale de la période chargée, en semaines, de part et d'autre
 * du centre de la fenêtre. Couvre la frise (−2 / +4 mois) et les barres
 * (largeur d'écran) avec de la marge.
 */
const DEMI_PLAGE_SEMAINES = 30

/** Période chargée pour une fenêtre affichée (centre + nombre de semaines). */
export function plageDepuisFenetre(centre: Date, nbSemaines: number): PlageOt {
  const demi = Math.max(DEMI_PLAGE_SEMAINES, Math.ceil(nbSemaines / 2) + 2)
  const lundi = lundiDeLaSemaine(centre)
  return {
    debut: isoLocale(ajouterSemaines(lundi, -demi)),
    fin: isoLocale(ajouterSemaines(lundi, demi)),
  }
}

/** Période posée par l'orchestrateur (`dashboard.tsx`), lue par les cadrans. */
export const PlageOtContext = createContext<PlageOt | null>(null)

/**
 * Hook agrégateur du tableau de bord : centralise les requêtes du site actif (OT
 * unifiés, documents, catégories, gammes, counts d'onboarding, documents
 * manquants — les trois journaux de la carte Activité ont les leurs, normalisées
 * par un `select` qui leur est propre) et expose des dérivations mémoïsées. Les cadrans consomment ce hook
 * plutôt que des requêtes dispersées → une seule source, un seul recalcul, et les
 * appels multiples sont dédupliqués par TanStack Query.
 *
 * Il NE pose PAS le realtime : c'est le rôle de `useDashboardRealtime`, monté une
 * seule fois par l'orchestrateur (sinon un canal par cadran → fuite).
 *
 * `siteId` peut être `null` (site non encore résolu) : chaque query est alors
 * désactivée (`queryFn: skipToken`) et les dérivations tombent à vide.
 */
export function useDashboardData(
  siteId: string | null,
  plageImposee?: PlageOt,
) {
  const plageContexte = useContext(PlageOtContext)
  const plage =
    plageImposee ??
    plageContexte ??
    plageDepuisFenetre(lundiDeLaSemaine(new Date()), 0)

  // ── Requêtes ───────────────────────────────────────────────────────────────
  // OT en trois morceaux (ouverts + période affichée + dernier passage par
  // gamme) : jamais tout l'historique. Quand la période change (flèches), la
  // précédente reste affichée le temps de lire la suivante.
  const ouvertsQuery = useQuery(dashboardQueries.otOuverts(siteId))
  const periodeQuery = useQuery({
    ...dashboardQueries.otPeriode(siteId, plage.debut, plage.fin),
    placeholderData: keepPreviousData,
  })
  const derniersPassagesQuery = useQuery(
    dashboardQueries.derniersPassages(siteId),
  )
  // Derniers fichiers : un APERÇU borné (`LIGNES_DOCUMENTS`), pas toute la
  // bibliothèque du site.
  const documentsQuery = useQuery(activiteQueries.documents(siteId))
  const categoriesQuery = useQuery(categoriesQueries.list(siteId))
  const gammesQuery = useQuery(gammesQueries.list(siteId))
  const documentsManquantsQuery = useQuery(
    dashboardQueries.documentsManquants(siteId),
  )

  // ── Dérivations mémoïsées ────────────────────────────────────────────────────
  // Même ordre qu'avant (date prévue, puis id) : les cadrans en dépendent.
  const ordresTravail: PlanningOt[] = [
    ...(ouvertsQuery.data ?? []),
    ...(periodeQuery.data ?? []),
  ].sort((a, b) =>
    a.date_prevue < b.date_prevue
      ? -1
      : a.date_prevue > b.date_prevue
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
  )
  const derniersPassages =
    derniersPassagesQuery.data ?? new Map<string, string>()

  // État d'ensemble des OT, pour l'orchestrateur (squelette / erreur / premiers
  // pas). « Aucun OT » = rien d'ouvert, rien dans la période, aucun passage.
  const requetesOt = [ouvertsQuery, periodeQuery, derniersPassagesQuery]
  const ordresTravailEtat = {
    isPending: requetesOt.some((q) => q.isPending),
    isError: requetesOt.some((q) => q.isError),
    aucunOt: ordresTravail.length === 0 && derniersPassages.size === 0,
    refetch: () => {
      for (const q of requetesOt) if (q.isError) void q.refetch()
    },
  }

  return {
    // Requêtes brutes (états loading/error consommés par l'orchestrateur).
    ordresTravailEtat,
    documentsQuery,
    categoriesQuery,
    gammesQuery,
    documentsManquantsQuery,
    // Dérivations mémoïsées.
    ordresTravail,
    derniersPassages,
  }
}
