import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
      queryKey: [...categoriesQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('categories')
          .select('*')
          .is('deleted_at', null)
          .order('ordre')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data.filter((c) => c.site_id === null || c.site_id === siteId)
      },
      staleTime: 60_000,
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
          .is('deleted_at', null)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
      staleTime: 60_000,
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
          .is('deleted_at', null)
          .order('ordre')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
