import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const travauxQueries = {
  all: () => ['travaux'] as const,

  /** Travaux du site actif (non supprimés), avec prestataire pour les cartes. */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('interventions_travaux')
          .select('*, prestataires(id, libelle)')
          .eq('site_id', siteId)
          .order('date_demande', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data.map((c) => ({
          ...c,
          prestataires: c.prestataires ?? null,
        }))
      },
      staleTime: 60_000,
    }),

  /** Locaux liés à un travaux (avec leur chemin lisible). */
  locaux: (travauxId: string) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'locaux', travauxId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('travaux_localisations')
          .select('local_id, locaux(id, nom)')
          .eq('travaux_id', travauxId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Équipements liés à un travaux. */
  equipements: (travauxId: string) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'equipements', travauxId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('travaux_equipements')
          .select('equipement_id, equipements(id, nom)')
          .eq('travaux_id', travauxId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}

export const statutsTravauxQueries = {
  all: () => ['statuts_travaux'] as const,

  /** Référentiel des statuts (machine à états, IDs stables). */
  list: () =>
    queryOptions({
      queryKey: [...statutsTravauxQueries.all(), 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('statuts_travaux')
          .select('id, nom, description')
          .order('id')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}
