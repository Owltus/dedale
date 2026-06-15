import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const equipementsQueries = {
  all: () => ['equipements'] as const,

  /** Équipements actifs du site actif (vue enrichie : chemin spatial + catégorie). */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...equipementsQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_equipements_complet')
          .select('*')
          .eq('site_id', siteId!)
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Catégories de PARC (scope 'parc') du site actif, actives. Depuis 028, les
   * équipements réels se rangent dans une taxonomie DÉDIÉE (scope 'parc'), séparée
   * des catégories de modèles (scope 'equipement', Bibliothèque). Toujours scopées
   * site (le parc appartient à un site) → on filtre sur `site_id`.
   */
  categories: (siteId: string | null) =>
    queryOptions({
      queryKey: [...equipementsQueries.all(), 'categories', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('categories')
          .select('id, nom, scope, site_id')
          .eq('scope', 'parc')
          .eq('site_id', siteId!)
          .eq('est_actif', true)
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Locaux actifs du site actif (pour le dropdown emplacement), via la vue chemin. */
  locaux: (siteId: string | null) =>
    queryOptions({
      queryKey: [...equipementsQueries.all(), 'locaux', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_locaux_chemin')
          .select('local_id, local_nom, chemin_court')
          .eq('site_id', siteId!)
          .order('chemin_court')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}

// Le catalogue de modèles d'équipements est désormais géré dans la feature
// dédiée `modeles-equipements`. On ré-exporte ici pour les consommateurs
// historiques (instanciation depuis l'écran Équipements) sans dupliquer la
// définition ni la clé de cache.
export {
  modelesEquipementsQueries,
  type ModeleEquipement,
} from '@/features/modeles-equipements/queries'
