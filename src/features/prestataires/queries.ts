import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const prestatairesQueries = {
  all: () => ['prestataires'] as const,

  /**
   * Prestataires accessibles à l'utilisateur (la RLS filtre selon le site/scope).
   * On laisse la RLS décider de la visibilité ; le tri est par libellé.
   */
  list: () =>
    queryOptions({
      queryKey: [...prestatairesQueries.all(), 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('prestataires')
          .select('*')
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}

export const contratsQueries = {
  all: () => ['contrats'] as const,

  /** Contrats du site actif, optionnellement filtrés sur un prestataire. */
  list: (siteId: string, prestataireId: string) =>
    queryOptions({
      queryKey: [
        ...contratsQueries.all(),
        'list',
        siteId,
        prestataireId,
      ] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('contrats')
          .select('*, types_contrats(id, libelle)')
          .eq('site_id', siteId)
          .eq('prestataire_id', prestataireId)
          .order('date_debut', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Nombre de contrats par prestataire pour le site actif (pour les cartes). */
  countsBySite: (siteId: string) =>
    queryOptions({
      queryKey: [...contratsQueries.all(), 'counts', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('contrats')
          .select('prestataire_id')
          .eq('site_id', siteId)
          .abortSignal(signal)
          .throwOnError()
        const counts = new Map<string, number>()
        for (const row of data) {
          counts.set(
            row.prestataire_id,
            (counts.get(row.prestataire_id) ?? 0) + 1,
          )
        }
        return counts
      },
      staleTime: 60_000,
    }),
}

export const typesContratsQueries = {
  all: () => ['types_contrats'] as const,

  list: () =>
    queryOptions({
      queryKey: [...typesContratsQueries.all(), 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('types_contrats')
          .select('id, libelle')
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}
