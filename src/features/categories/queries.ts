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
}
