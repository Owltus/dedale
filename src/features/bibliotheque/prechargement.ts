import type { QueryClient } from '@tanstack/react-query'
import { categoriesQueries } from '@/features/categories/queries'
import { modelesEquipementsQueries } from '@/features/modeles-equipements/queries'
import { modelesOperationsQueries } from '@/features/modeles-operations/queries'
import { gammesQueries } from '@/features/gammes/queries'
import { modelesDiQueries } from '@/features/modeles-di/queries'
import { miniaturesQueries } from '@/features/miniatures/queries'
import { localisationsQueries } from '@/features/localisations/queries'

/**
 * Précharge en parallèle les listes de TOUS les onglets dès l'arrivée sur la
 * page (cache partagé TanStack Query). Sans ça, chaque panneau lance sa requête
 * au montage → on voit les skeletons « cadres vides » au 1er affichage ET au 1er
 * passage sur chaque onglet. `ensureQueryData` renvoie le cache s'il existe
 * (no-op après le 1er chargement) → arrivée sans skeleton, onglets instantanés.
 * Fail-open : une requête en échec ne bloque pas la page (chaque panneau gère
 * son propre état d'erreur ; la RLS reste l'arbitre). Le rafraîchissement de
 * fraîcheur est laissé au useQuery des panneaux (en arrière-plan, sans skeleton).
 */
export async function prechargerBibliotheque(qc: QueryClient) {
  try {
    await Promise.all([
      qc.ensureQueryData(categoriesQueries.pool()),
      qc.ensureQueryData(modelesEquipementsQueries.pool()),
      qc.ensureQueryData(modelesOperationsQueries.pool()),
      qc.ensureQueryData(gammesQueries.biblioPool()),
      qc.ensureQueryData(modelesDiQueries.pool()),
      qc.ensureQueryData(miniaturesQueries.pool()),
      qc.ensureQueryData(localisationsQueries.typesLocaux()),
    ])
  } catch {
    // préchargement best-effort : on n'empêche pas l'affichage
  }
}
