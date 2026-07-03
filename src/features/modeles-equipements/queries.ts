import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { estCommunOuDuSite } from '@/lib/scope'
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
      // Réutilise le fetch de `pool()` (même `queryKey`, un seul aller-retour
      // partagé) puis restreint côté client aux modèles ACTIFS du périmètre
      // commun + site : contenu identique à l'ancienne query dédiée.
      ...modelesEquipementsQueries.pool(),
      enabled: siteId !== null,
      select: (rows) =>
        rows.filter((m) => m.est_actif && estCommunOuDuSite(m, siteId)),
    }),

  /**
   * Catalogue COMPLET (modèles actifs et masqués) pour la gestion en
   * bibliothèque. Inclut la catégorie liée (jointure) pour l'affichage.
   */
  catalogue: (siteId: string | null) =>
    queryOptions({
      // Réutilise le fetch de `pool()` (même `queryKey`, un seul aller-retour
      // partagé) et n'applique le périmètre commun + site que côté client via
      // `select` : contenu identique à l'ancienne query dédiée.
      ...modelesEquipementsQueries.pool(),
      select: (rows) => rows.filter((m) => estCommunOuDuSite(m, siteId)),
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
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
