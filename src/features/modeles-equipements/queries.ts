import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ModeleEquipement =
  Database['public']['Tables']['modeles_equipements']['Row']

export const modelesEquipementsQueries = {
  all: () => ['modeles_equipements'] as const,

  /**
   * Modèles ACTIFS **DU SITE**, pour les écrans opérationnels (gabarit d'une
   * sous-catégorie d'équipements). Le catalogue COMMUN en est volontairement
   * exclu : un écran de site ne propose jamais un template non déployé — on
   * l'installe d'abord depuis la Bibliothèque (« Importer depuis le commun »),
   * ce qui en dépose une copie sur le site. Même règle, au même endroit, que
   * les modèles de DI proposés à la création d'une demande.
   */
  list: (siteId: string | null) =>
    queryOptions({
      // Réutilise le fetch de `pool()` (même `queryKey`, un seul aller-retour
      // partagé) puis restreint côté client. La RLS reste l'arbitre réel.
      ...modelesEquipementsQueries.pool(),
      enabled: siteId !== null,
      select: (rows) => rows.filter((m) => m.est_actif && m.site_id === siteId),
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
          .select(
            '*, categories!modeles_equipements_categorie_id_fkey(id, nom)',
          )
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
