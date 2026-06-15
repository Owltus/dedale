import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ModeleEquipement =
  Database['public']['Tables']['modeles_equipements']['Row']

export const modelesEquipementsQueries = {
  all: () => ['modeles_equipements'] as const,

  /**
   * Modèles ACTIFS visibles, pour l'instanciation depuis l'écran Équipements.
   * Scope entreprise (site_id NULL) + scope du site actif. La RLS filtre déjà ;
   * on restreint en plus au site courant côté client.
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...modelesEquipementsQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_equipements')
          // Embed désambiguïsé : depuis 029, il existe DEUX relations
          // modeles_equipements ↔ categories (categorie_id du modèle, et
          // categories.modele_equipement_id en sens inverse). On force la 1re via le
          // nom de contrainte FK, sinon PostgREST refuse l'embed (ambigu).
          .select('*, categories!modeles_equipements_categorie_id_fkey(id, nom)')
          .eq('est_actif', true)
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data.filter((m) => m.site_id === null || m.site_id === siteId)
      },
      staleTime: 60_000,
    }),

  /**
   * Catalogue COMPLET (modèles actifs et masqués) pour la gestion en
   * bibliothèque. Inclut la catégorie liée (jointure) pour l'affichage.
   */
  catalogue: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...modelesEquipementsQueries.all(),
        'catalogue',
        siteId,
      ] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_equipements')
          // Embed désambiguïsé : depuis 029, il existe DEUX relations
          // modeles_equipements ↔ categories (categorie_id du modèle, et
          // categories.modele_equipement_id en sens inverse). On force la 1re via le
          // nom de contrainte FK, sinon PostgREST refuse l'embed (ambigu).
          .select('*, categories!modeles_equipements_categorie_id_fkey(id, nom)')
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data.filter((m) => m.site_id === null || m.site_id === siteId)
      },
      staleTime: 60_000,
    }),

  /**
   * Catalogue COMPLET (actifs + masqués) SANS filtre de site : le périmètre est
   * appliqué côté composant. Inclut la catégorie liée pour l'affichage.
   */
  pool: () =>
    queryOptions({
      queryKey: [...modelesEquipementsQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_equipements')
          // Embed désambiguïsé : depuis 029, il existe DEUX relations
          // modeles_equipements ↔ categories (categorie_id du modèle, et
          // categories.modele_equipement_id en sens inverse). On force la 1re via le
          // nom de contrainte FK, sinon PostgREST refuse l'embed (ambigu).
          .select('*, categories!modeles_equipements_categorie_id_fkey(id, nom)')
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
