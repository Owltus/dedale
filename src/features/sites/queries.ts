import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const sitesQueries = {
  all: () => ['sites'] as const,

  /** Tous les sites non supprimés (RLS : admin = tous). Pour l'écran d'administration. */
  list: () =>
    queryOptions({
      queryKey: [...sitesQueries.all(), 'list'] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('sites')
          .select('*')
          .is('deleted_at', null)
          .order('nom')
          .throwOnError()
        return data
      },
    }),

  /** Sites accessibles à l'utilisateur connecté (admin = tous, sinon ses sites).
   *  `refetchOnWindowFocus: 'always'` : une (ré)affectation de site faite ailleurs
   *  est prise en compte au retour sur l'onglet (la RPC lit l'état en direct). */
  mine: () =>
    queryOptions({
      queryKey: [...sitesQueries.all(), 'mine'] as const,
      queryFn: async () => {
        const { data } = await supabase.rpc('get_my_sites').throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: 'always',
    }),
}
