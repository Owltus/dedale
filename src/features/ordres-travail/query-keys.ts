import type { QueryKey } from '@tanstack/react-query'
import { ordresTravailQueries } from './queries'
import { planningQueries } from '@/features/planning/queries'

/**
 * Clés RACINES impactées par tout changement de la table `ordres_travail` :
 * la liste / le détail / les cartes (clé `ordres_travail`) ET le planning
 * (clé `planning`, qui lit la MÊME table sous une autre clé). Sans la seconde,
 * clôturer ou changer un statut ne rafraîchissait pas la grille du planning.
 *
 * Consommé par `invalidateOt` (mutations) et par les abonnements live
 * `useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)` — centralisé ici pour
 * qu'il soit impossible d'oublier une clé.
 */
export const OT_QUERY_KEYS: readonly QueryKey[] = [
  ordresTravailQueries.all(),
  planningQueries.all(),
]
