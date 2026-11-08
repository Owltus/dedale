import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toutesLesLignes } from '@/lib/pagination'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'

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
          // 105 : plus de colonne nom sur equipements — tri par nom de
          // catégorie (regroupe les équipements du même type), puis par
          // identifiant à l'intérieur d'un même type.
          .order('categorie_nom')
          .order('code_inventaire')
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

  /** Ids des gammes liées à un équipement (table de liaison gammes_equipements). */
  gammesLiees: (equipementId: string) =>
    queryOptions({
      queryKey: [...equipementsQueries.all(), 'gammes', equipementId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes_equipements')
          .select('gamme_id')
          .eq('equipement_id', equipementId)
          .abortSignal(signal)
          .throwOnError()
        return data.map((r) => r.gamme_id)
      },
      staleTime: 60_000,
    }),

  /**
   * Historique d'UN équipement (128, gamme répétée par équipement) : ses lignes
   * d'exécution avec l'OT porteur, de la plus récente à la plus ancienne.
   * Clé rangée sous le namespace `ordres_travail` : toute écriture d'OT et le
   * realtime l'invalident déjà. Paginé (plafond silencieux de 1 000 lignes).
   */
  historique: (equipementId: string) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'historique-equipement',
        equipementId,
      ] as const,
      enabled: equipementId !== '',
      queryFn: ({ signal }) =>
        toutesLesLignes((debut, fin) =>
          supabase
            .from('operations_execution')
            .select(
              'id, nom, statut, date_execution, ordre, ordres_travail!inner(id, nom_gamme, statut, date_prevue, date_cloture)',
            )
            .eq('equipement_id', equipementId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(debut, fin)
            .abortSignal(signal)
            .throwOnError(),
        ),
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
