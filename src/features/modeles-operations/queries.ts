import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ModeleOperation =
  Database['public']['Tables']['modeles_operations']['Row']

export const modelesOperationsQueries = {
  all: () => ['modeles_operations'] as const,

  /**
   * Modèles d'opérations (gammes-types) visibles : scope entreprise (site_id
   * NULL) + scope du site actif. Pas de soft-delete sur cette table.
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations')
          .select('*')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data.filter((m) => m.site_id === null || m.site_id === siteId)
      },
      staleTime: 60_000,
    }),

  /** Items (opérations types) d'un modèle, ordonnés, avec type et unité. */
  items: (modeleId: string) =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'items', modeleId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations_items')
          .select(
            '*, types_operations(id, libelle, necessite_seuils), unites(id, nom, symbole)',
          )
          .eq('modele_operation_id', modeleId)
          .order('ordre')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Tout l'accessible (RLS) SANS filtre de site : le périmètre (Tout / Commun /
   * site) est appliqué côté composant.
   */
  pool: () =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations')
          .select('*')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
