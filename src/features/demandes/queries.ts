import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const demandesQueries = {
  all: () => ['demandes_intervention'] as const,

  /**
   * DI du site actif (non supprimées). La RLS restreint déjà la visibilité :
   * le rôle `demandeur` ne voit que ses propres DI → aucun filtre client à ajouter.
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('demandes_intervention')
          .select('*')
          .eq('site_id', siteId!)
          .is('deleted_at', null)
          .order('date_constat', { ascending: false })
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Détail d'une DI (vide = normal si la RLS la masque → maybeSingle). */
  detail: (id: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'detail', id] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('demandes_intervention')
          .select('*')
          .eq('id', id)
          .is('deleted_at', null)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
    }),

  /** Locaux liés à une DI (avec leur chemin lisible). */
  localisations: (diId: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'localisations', diId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('di_localisations')
          .select('local_id, locaux(id, nom)')
          .eq('di_id', diId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Équipements liés à une DI. */
  equipements: (diId: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'equipements', diId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('di_equipements')
          .select('equipement_id, equipements(id, nom)')
          .eq('di_id', diId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}

export const statutsDiQueries = {
  all: () => ['statuts_di'] as const,

  /** Référentiel des statuts DI (1 Ouverte, 2 Résolue, 3 Réouverte). */
  list: () =>
    queryOptions({
      queryKey: [...statutsDiQueries.all(), 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('statuts_di')
          .select('id, nom')
          .order('id')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}

export const modelesDiQueries = {
  all: () => ['modeles_di'] as const,

  /** Modèles actifs commun + site, pour la suggestion à la création d'une DI. */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...modelesDiQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_di')
          .select('id, libelle, constat_modele')
          .or(`site_id.is.null,site_id.eq.${siteId!}`)
          .eq('est_actif', true)
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
