import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const gammesQueries = {
  all: () => ['gammes'] as const,

  /** Gammes actives du site actif, enrichies de la périodicité et du prestataire. */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes')
          .select(
            '*, periodicites(id, libelle, jours_periodicite), prestataires(id, libelle)',
          )
          .eq('site_id', siteId!)
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Opérations d'une gamme, ordonnées, avec type et unité. */
  operations: (gammeId: string) =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'operations', gammeId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('operations')
          .select(
            '*, types_operations(id, libelle, necessite_seuils), unites(id, nom, symbole)',
          )
          .eq('gamme_id', gammeId)
          .order('ordre')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Équipements liés à une gamme (ids uniquement, pour cocher la liste). */
  equipementsLies: (gammeId: string) =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'equipements', gammeId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes_equipements')
          .select('equipement_id')
          .eq('gamme_id', gammeId)
          .abortSignal(signal)
          .throwOnError()
        return data.map((r) => r.equipement_id)
      },
      staleTime: 60_000,
    }),
}

export const referentielsQueries = {
  /** Périodicités (référentiel global, peu mouvant). */
  periodicites: () =>
    queryOptions({
      queryKey: ['periodicites', 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('periodicites')
          .select('id, libelle, jours_periodicite')
          .order('jours_periodicite')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),

  /** Types d'opération (référentiel global). */
  typesOperations: () =>
    queryOptions({
      queryKey: ['types_operations', 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('types_operations')
          .select('id, libelle, necessite_seuils')
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),

  /** Unités de mesure (référentiel global). */
  unites: () =>
    queryOptions({
      queryKey: ['unites', 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('unites')
          .select('id, nom, symbole')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}
