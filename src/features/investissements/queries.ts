import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'

export const investissementsQueries = {
  all: () => ['investissements'] as const,

  /** Investissements du site actif, plus récents d'abord. */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...investissementsQueries.all(), 'list', siteId] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('investissements')
          .select('*')
          .eq('site_id', siteId)
          .order('date_demande', { ascending: false })
          .throwOnError()
        return data
      },
    }),
}

export const statutsCapexQueries = {
  /** Référentiel des statuts CapEx (statut libre, pas de machine à états). */
  list: () => referentielQueryOptions('statuts_capex', 'id, nom', 'nom'),
}
