import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { estCommunOuDuSite } from '@/lib/scope'
import type { Database } from '@/lib/database.types'

export type Categorie = Database['public']['Tables']['categories']['Row']

export const categoriesQueries = {
  all: () => ['categories'] as const,

  /**
   * Catégories visibles : scope entreprise (site_id NULL) + scope du site actif.
   * La RLS filtre déjà la visibilité réelle ; ce filtre garde la cohérence d'UI
   * quand plusieurs sites sont accessibles. Liste plate : l'arbre est reconstruit
   * côté composant à partir de `parent_id`.
   */
  list: (siteId: string | null) =>
    queryOptions({
      // Réutilise le fetch de `pool()` (même `queryKey`, un seul aller-retour
      // partagé) et n'applique le périmètre commun + site que côté client via
      // `select` : le contenu retourné reste identique à l'ancienne query dédiée.
      ...categoriesQueries.pool(),
      select: (rows) => rows.filter((c) => estCommunOuDuSite(c, siteId)),
    }),

  /**
   * Une catégorie par son id (libellé pour l'affichage), même inactive : permet
   * de réinjecter dans un select la valeur réellement assignée à une entité
   * (ex. une gamme pointant une sous-catégorie masquée). Absence/RLS → `null`
   * (normal), d'où `.maybeSingle()`.
   */
  byId: (id: string | null) =>
    queryOptions({
      queryKey: [...categoriesQueries.all(), 'by-id', id] as const,
      enabled: id !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('categories')
          .select('id, nom')
          .eq('id', id!)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
    }),

  /**
   * Tout l'accessible (RLS) SANS filtre de site : le périmètre (Tout / Commun /
   * site) est appliqué côté composant via le sélecteur de la Bibliothèque.
   */
  pool: () =>
    queryOptions({
      queryKey: [...categoriesQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('categories')
          .select('*')
          .order('ordre')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
