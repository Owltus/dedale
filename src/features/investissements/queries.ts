import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const investissementsQueries = {
  all: () => ['investissements'] as const,

  /** Investissements du site actif (non supprimés). */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...investissementsQueries.all(), 'list', siteId] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('investissements')
          .select('*')
          .eq('site_id', siteId)
          .is('deleted_at', null)
          .order('date_demande', { ascending: false })
          .throwOnError()
        return data
      },
    }),
}

export const statutsCapexQueries = {
  all: () => ['statuts_capex'] as const,

  /** Référentiel des statuts CapEx (statut libre, pas de machine à états). */
  list: () =>
    queryOptions({
      queryKey: [...statutsCapexQueries.all(), 'list'] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('statuts_capex')
          .select('id, nom')
          .order('nom')
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}
