import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const chantiersQueries = {
  all: () => ['chantiers'] as const,

  /** Chantiers du site actif (non supprimés), avec prestataire pour les cartes. */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...chantiersQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('interventions_chantier')
          .select('*, prestataires(id, libelle)')
          .eq('site_id', siteId)
          .is('deleted_at', null)
          .order('date_demande', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Un chantier précis (détail en page). */
  detail: (id: string) =>
    queryOptions({
      queryKey: [...chantiersQueries.all(), 'detail', id] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('interventions_chantier')
          .select('*, prestataires(id, libelle)')
          .eq('id', id)
          .is('deleted_at', null)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Locaux liés à un chantier (avec leur chemin lisible). */
  locaux: (chantierId: string) =>
    queryOptions({
      queryKey: [...chantiersQueries.all(), 'locaux', chantierId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('chantier_localisations')
          .select('local_id, locaux(id, nom)')
          .eq('chantier_id', chantierId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Équipements liés à un chantier. */
  equipements: (chantierId: string) =>
    queryOptions({
      queryKey: [...chantiersQueries.all(), 'equipements', chantierId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('chantier_equipements')
          .select('equipement_id, equipements(id, nom)')
          .eq('chantier_id', chantierId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}

export const statutsChantierQueries = {
  all: () => ['statuts_chantier'] as const,

  /** Référentiel des statuts (machine à états, IDs stables). */
  list: () =>
    queryOptions({
      queryKey: [...statutsChantierQueries.all(), 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('statuts_chantier')
          .select('id, nom, description')
          .order('id')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}
