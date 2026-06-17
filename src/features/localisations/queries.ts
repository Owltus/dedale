import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const localisationsQueries = {
  all: () => ['localisations'] as const,

  /** Bâtiments actifs d'un site. */
  batiments: (siteId: string | null) =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'batiments', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('batiments')
          .select('*')
          .eq('site_id', siteId!)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Niveaux actifs d'un bâtiment. */
  niveaux: (batimentId: string | null) =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'niveaux', batimentId] as const,
      enabled: batimentId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('niveaux')
          .select('*')
          .eq('batiment_id', batimentId!)
          .order('ordre')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Locaux actifs d'un niveau. */
  locaux: (niveauId: string | null) =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'locaux', niveauId] as const,
      enabled: niveauId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('locaux')
          .select('*')
          .eq('niveau_id', niveauId!)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Surface roulée par bâtiment du site (somme des locaux). */
  batimentsSurface: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...localisationsQueries.all(),
        'batiments-surface',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_batiments_surface')
          .select('batiment_id, surface_m2, surface_chauffee_m2')
          .eq('site_id', siteId!)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Surface roulée par niveau d'un bâtiment (somme des locaux). */
  niveauxSurface: (batimentId: string | null) =>
    queryOptions({
      queryKey: [
        ...localisationsQueries.all(),
        'niveaux-surface',
        batimentId,
      ] as const,
      enabled: batimentId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_niveaux_surface')
          .select('niveau_id, surface_m2, surface_chauffee_m2')
          .eq('batiment_id', batimentId!)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Types de locaux actifs (référentiel global), pour le dropdown. */
  typesLocaux: () =>
    queryOptions({
      queryKey: [...localisationsQueries.all(), 'types-locaux'] as const,
      staleTime: 5 * 60_000,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('types_locaux')
          .select('*')
          .eq('actif', true)
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
