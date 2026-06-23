import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const ordresTravailQueries = {
  all: () => ['ordres_travail'] as const,

  /** OT du site actif (non supprimés), pour les cartes de la liste. */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...ordresTravailQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, nom_gamme, nom_prestataire, nom_equipement, nature_gamme, date_prevue, date_cloture, libelle_periodicite',
          )
          .eq('site_id', siteId!)
          .order('date_prevue', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * OT du site rattachés à une liste de gammes (panneau bas du Plan de
   * maintenance, au palier sous-catégorie). TOUS statuts confondus, triés par
   * date prévue (plus récent d'abord). Un OT à `gamme_id` NULL (gamme supprimée,
   * `ON DELETE SET NULL`) n'est plus rattachable → exclu naturellement par le
   * filtre `.in(...)`. queryKey STABLE : ids triés + joints (un tableau brut
   * change de référence à chaque rendu et casserait le cache).
   */
  byGammes: (siteId: string | null, gammeIds: string[]) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'by-gammes',
        siteId,
        [...gammeIds].sort().join(','),
      ] as const,
      enabled: siteId !== null && gammeIds.length > 0,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, nom_gamme, nom_prestataire, nom_equipement, date_prevue, gamme_id',
          )
          .eq('site_id', siteId!)
          .in('gamme_id', gammeIds)
          .order('date_prevue', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Un OT précis (détail en page). */
  detail: (id: string) =>
    queryOptions({
      queryKey: [...ordresTravailQueries.all(), 'detail', id] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select('*')
          .eq('id', id)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Opérations d'exécution (snapshot) d'un OT, ordonnées. */
  operations: (otId: string) =>
    queryOptions({
      queryKey: [...ordresTravailQueries.all(), 'operations', otId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('operations_execution')
          .select('*')
          .eq('ordre_travail_id', otId)
          .order('ordre', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 30_000,
    }),
}

/** Gammes du site sélectionnables pour créer un OT (actives, non supprimées). */
export const gammesPourOtQueries = {
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: ['ordres_travail', 'gammes_creables', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes')
          .select('id, nom, nature, prestataire_id, periodicites(libelle)')
          .eq('site_id', siteId!)
          .eq('est_active', true)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
