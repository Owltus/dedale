import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'

export const travauxQueries = {
  all: () => ['travaux'] as const,

  /** Travaux du site actif. */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('interventions_travaux')
          .select('*')
          .eq('site_id', siteId)
          .order('date_demande', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Zones concernées par un travail (local + équipement optionnel + statut). */
  taches: (travauxId: string) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'taches', travauxId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('travaux_taches')
          .select(
            'id, statut, ordre, local_id, equipement_id, created_at, locaux(id, nom), equipements(id, nom)',
          )
          .eq('travaux_id', travauxId)
          .order('ordre')
          .order('created_at')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}

export const statutsTravauxQueries = {
  /** Référentiel des statuts (machine à états, IDs stables). */
  list: () =>
    referentielQueryOptions('statuts_travaux', 'id, nom, description', 'id'),
}
