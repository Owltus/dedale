import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Les vues v_registre_securite / v_observations_dashboard sont en security_invoker :
// la RLS des tables sous-jacentes filtre déjà par site accessible, on filtre en
// plus par le site actif.

export const observationsQueries = {
  all: () => ['observations'] as const,

  /** Observations du site (liste/cartes). Jointure OT pour afficher le rattachement. */
  list: (siteId: string | null, filtres: { statut: string; source: string }) =>
    queryOptions({
      queryKey: [
        ...observationsQueries.all(),
        'list',
        siteId,
        filtres,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        let q = supabase
          .from('observations')
          .select(
            'id, source, gravite, description, echeance, statut, date_levee, commentaire_levee, ot_id, equipement_id, created_at, ordres_travail(nom_gamme), equipements(nom)',
          )
          .eq('site_id', siteId!)
        if (filtres.statut)
          q = q.eq('statut', filtres.statut as 'en_cours' | 'levee')
        if (filtres.source)
          q = q.eq(
            'source',
            filtres.source as
              | 'controle_reglementaire'
              | 'commission_securite'
              | 'inspection_interne',
          )
        const { data } = await q
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Compteurs conformité du site (badges). */
  dashboard: (siteId: string | null) =>
    queryOptions({
      queryKey: [...observationsQueries.all(), 'dashboard', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_observations_dashboard')
          .select('*')
          .eq('site_id', siteId!)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Registre de sécurité du site (OT contrôle clôturés + observations). Lecture. */
  registre: (siteId: string | null) =>
    queryOptions({
      queryKey: [...observationsQueries.all(), 'registre', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('v_registre_securite')
          .select('*')
          .eq('site_id', siteId!)
          .order('date_ligne', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}

/** OT du site sélectionnables pour rattacher une observation. */
export const otsPourObservationQueries = {
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: ['observations', 'ots_rattachables', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select('id, nom_gamme, nom_equipement')
          .eq('site_id', siteId!)
          .order('date_prevue', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
