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
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Catégories de PARC (scope 'parc') du site actif, actives. Depuis 028, les
   * équipements réels se rangent dans une taxonomie DÉDIÉE (scope 'parc'), séparée
   * des catégories de modèles (scope 'equipement', Bibliothèque). Toujours scopées
   * site (le parc appartient à un site) → on filtre sur `site_id`.
   *
   * Clé sous le namespace `categories` (et NON `equipements`) : la donnée EST une
   * table de catégories → un changement de catégories (mutation ou Realtime, qui
   * invalident `['categories']`) doit la rafraîchir, pas une modification
   * d'équipement.
   */
  categories: (siteId: string | null) =>
    queryOptions({
      queryKey: ['categories', 'parc', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('categories')
          .select('id, nom, scope, site_id')
          .eq('scope', 'parc')
          .eq('site_id', siteId!)
          .eq('est_actif', true)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Locaux actifs du site actif (pour le dropdown emplacement), via la vue chemin. */
  locaux: (siteId: string | null) =>
    queryOptions({
      // Clé sous le namespace `localisations` (et NON `equipements`) : la donnée
      // dépend des localisations, pas des équipements. Ainsi une mutation ou un
      // Realtime de localisations (qui invalident ['localisations']) rafraîchit ce
      // chemin, tandis qu'une modification d'équipement ne le refetch pas inutilement.
      queryKey: ['localisations', 'chemins', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_locaux_chemin')
          .select(
            'local_id, local_nom, chemin_court, batiment_id, batiment_nom, niveau_id, niveau_nom',
          )
          .eq('site_id', siteId!)
          .order('chemin_court')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
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
