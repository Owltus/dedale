import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ModeleDi = Database['public']['Tables']['modeles_di']['Row']

export const modelesDiQueries = {
  all: () => ['modeles_di'] as const,

  /**
   * Modèles de DI du site actif. Cette table est à scope SITE strict (site_id
   * NOT NULL) : pas de niveau entreprise, d'où le filtre direct par site.
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...modelesDiQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_di')
          .select('*')
          .eq('site_id', siteId!)
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Tous les modèles de DI accessibles (tous les sites de l'utilisateur via la
   * RLS). Table à scope SITE strict → PAS de niveau « Commun ». Le périmètre
   * (Tout / site) est appliqué côté composant.
   */
  pool: () =>
    queryOptions({
      queryKey: [...modelesDiQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_di')
          .select('*')
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
