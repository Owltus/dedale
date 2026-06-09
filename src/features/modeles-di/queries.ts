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
}
