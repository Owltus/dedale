import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  LIGNES_PAR_ONGLET,
  decalageSuivant,
  toutesLesLignes,
} from '@/lib/pagination'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { localisationsQueries } from '@/features/localisations/queries'
import { clesRacines } from '@/lib/cles-racines'
import { regrouperLots } from './deploiement'

export const equipementsQueries = {
  all: () => ['equipements'] as const,

  /** Équipements actifs du site actif (vue enrichie : chemin spatial + catégorie). */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...equipementsQueries.all(), 'list', siteId] as const,
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('v_equipements_complet')
                .select('*')
                .eq('site_id', siteId)
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
   * Équipements d'un LIEU, 50 à la fois (vue enrichie, même ligne que `list`) :
   * lecture bornée par `local_id`, tri par catégorie puis identifiant.
   */
  duLieu: (localId: string | null) =>
    infiniteQueryOptions({
      queryKey: [...equipementsQueries.all(), 'du-lieu', localId] as const,
      initialPageParam: 0,
      // Lieu absent (onglet vide d’après le compteur) → aucune lecture.
      queryFn:
        localId === null
          ? skipToken
          : async ({ pageParam, signal }) => {
              const { data } = await supabase
                .from('v_equipements_complet')
                .select('*')
                .eq('local_id', localId)
                .order('categorie_nom')
                .order('code_inventaire')
                .order('id')
                .range(pageParam, pageParam + LIGNES_PAR_ONGLET - 1)
                .abortSignal(signal)
                .throwOnError()
              return data
            },
      getNextPageParam: decalageSuivant,
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
      queryFn:
        equipementId === ''
          ? skipToken
          : ({ signal }) =>
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

  /**
   * Plans de maintenance ACTIFS du site, proposés au déploiement en masse
   * (rattachés aux équipements créés). Le commun n'y figure jamais
   * (`site_id` du site, ADR 0009) : la base le refuserait. Clé rangée sous la
   * racine des gammes (`clesRacines`) : toute écriture de gamme la rafraîchit,
   * sans qu'equipements importe la feature gammes (qui l'importe, elle).
   */
  gammesDeployables: (siteId: string | null) =>
    queryOptions({
      queryKey: [...clesRacines.gammes(), 'deployables', siteId] as const,
      queryFn:
        siteId === null
          ? skipToken
          : ({ signal }) =>
              toutesLesLignes((debut, fin) =>
                supabase
                  .from('gammes')
                  .select('id, nom, repeter_par_equipement')
                  .eq('site_id', siteId)
                  .eq('est_active', true)
                  .order('nom')
                  .order('id')
                  .range(debut, fin)
                  .abortSignal(signal)
                  .throwOnError(),
              ),
    }),

  /**
   * Déploiements en masse d'une flotte (sous-catégorie de parc), regroupés par
   * lot, du plus récent. Lit la TABLE `equipements` : `v_equipements_complet`
   * a été créée avec `e.*` avant la colonne `lot_deploiement` et ne la porte
   * pas. Pas d'auteur : la table n'a pas de `created_by`. Paginée
   * (`toutesLesLignes`) : une flotte peut dépasser 1 000 équipements.
   */
  lots: (categorieId: string | null) =>
    queryOptions({
      queryKey: [...equipementsQueries.all(), 'lots', categorieId] as const,
      queryFn:
        categorieId === null
          ? skipToken
          : async ({ signal }) =>
              regrouperLots(
                await toutesLesLignes((debut, fin) =>
                  supabase
                    .from('equipements')
                    .select('id, lot_deploiement, created_at')
                    .eq('categorie_id', categorieId)
                    .not('lot_deploiement', 'is', null)
                    .order('created_at')
                    .order('id')
                    .range(debut, fin)
                    .abortSignal(signal)
                    .throwOnError(),
                ),
              ),
    }),

  /** Locaux actifs du site actif (pour le dropdown emplacement), via la vue chemin. */
  locaux: (siteId: string | null) =>
    queryOptions({
      // Clé sous le namespace `localisations` (et NON `equipements`) : la donnée
      // dépend des localisations, pas des équipements. Ainsi une mutation ou un
      // Realtime de localisations (qui invalident ['localisations']) rafraîchit ce
      // chemin, tandis qu'une modification d'équipement ne le refetch pas inutilement.
      queryKey: [...localisationsQueries.all(), 'chemins', siteId] as const,
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('v_locaux_chemin')
                .select(
                  'local_id, local_nom, chemin_court, batiment_id, batiment_nom, niveau_id, niveau_nom',
                )
                .eq('site_id', siteId)
                .order('chemin_court')
                .abortSignal(signal)
                .throwOnError()
              return data
            },
    }),
}
