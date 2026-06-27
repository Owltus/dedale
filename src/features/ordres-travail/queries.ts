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
            'id, statut, nom_gamme, nom_prestataire, nom_equipement, nature_gamme, date_prevue, date_cloture, libelle_periodicite, miniature_id',
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
            'id, statut, nom_gamme, nom_prestataire, nom_equipement, date_prevue, gamme_id, miniature_id',
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
          // `*` inclut miniature_id : l'image ESTHÉTIQUE PROPRE de l'OT (snapshot
          // souple hérité de la gamme à la création — migration 067). On ne joint
          // plus l'image VIVANTE de la gamme : un OT terminal garde la sienne.
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

  /**
   * Dernier relevé connu (avec valeur) des opérations COMPTEUR visées, pris sur
   * les OT STRICTEMENT ANTÉRIEURS (date_prevue < celle du courant) de la MÊME gamme
   * → rappel « précédent : X ». Le 1er relevé d'un compteur n'a donc PAS de précédent.
   *
   * On relie « la même opération récurrente » d'un OT à l'autre par (source_type,
   * source_id) : depuis la migration 063, source_id pointe la VRAIE opération de gamme
   * (operations.id), donc il est STABLE et identique sur tous les OT de la gamme — y
   * compris les futurs OT générés par le trigger. Lien immuable, insensible au renommage
   * (063 a corrigé les source_id aléatoires posés par l'import 061).
   *
   * Requête en 2 temps (OT de la gamme, puis relevés) pour éviter un filtre PostgREST
   * sur table embarquée. La RLS (opex_site_scoped_select + politique site sur
   * ordres_travail) cloisonne par site → aucune fuite cross-site.
   * Retour : map `${source_type}:${source_id}` → valeur du dernier relevé terminé.
   */
  previousReadings: (
    otId: string,
    gammeId: string | null,
    currentDatePrevue: string | null,
    sourceIds: string[],
  ) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'previous-readings',
        otId,
        gammeId,
        currentDatePrevue,
        [...sourceIds].sort(),
      ] as const,
      enabled:
        gammeId !== null && currentDatePrevue !== null && sourceIds.length > 0,
      queryFn: async ({ signal }) => {
        const map: Record<string, number> = {}
        const { data: ots } = await supabase
          .from('ordres_travail')
          .select('id')
          .eq('gamme_id', gammeId!)
          // STRICTEMENT antérieurs : uniquement les OT planifiés AVANT le courant →
          // le 1er relevé d'un compteur n'a pas de « précédent » (rien à afficher).
          .lt('date_prevue', currentDatePrevue!)
          .neq('id', otId)
          .abortSignal(signal)
          .throwOnError()
        const otIds = ots.map((o) => o.id)
        if (otIds.length === 0) return map
        const { data } = await supabase
          .from('operations_execution')
          .select('source_type, source_id, valeur_mesuree')
          .in('ordre_travail_id', otIds)
          .in('source_id', sourceIds)
          .eq('statut', 'terminee')
          .not('valeur_mesuree', 'is', null)
          // date_execution est NULLABLE (OT historiques importés : un relevé peut
          // avoir une valeur sans date). On NE les exclut PAS — NULLS LAST pour que le
          // 1er par source (boucle) soit le relevé daté le plus récent quand il existe.
          // created_at départage deux relevés du même jour (date à midi UTC = égale).
          .order('date_execution', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        for (const r of data) {
          // Liste triée par date DESC → le 1er rencontré par source est le plus récent.
          const key = `${String(r.source_type)}:${r.source_id}`
          if (!(key in map)) map[key] = r.valeur_mesuree
        }
        return map
      },
      staleTime: 60_000,
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
