import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GammeRow } from '@/features/gammes/components/gamme-detail'

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

  /**
   * Gammes COUVERTES par les contrats du prestataire sur le site actif (décision
   * PO : couverture contractuelle, et NON le lien direct `gammes.prestataire_id` ;
   * compartimentage strict au site). Double `!inner` (`contrats_gammes` →
   * `contrats`) : le filtre sur le prestataire + le site borne les gammes, sans
   * dupliquer la ligne gamme. Clé préfixée `gammes` → invalidée par les écritures
   * de gammes. Pour la liste lecture seule de l'onglet Gammes.
   */
  gammes: (prestataireId: string, siteId: string) =>
    queryOptions({
      queryKey: ['gammes', 'par-prestataire', prestataireId, siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes')
          // `*` + jointures pour satisfaire `GammeRow` (réutilise `GammeCard`). Le
          // double `!inner` (`contrats_gammes` → `contrats`) ne sert qu'au FILTRE
          // (prestataire + site) ; il ne duplique pas la ligne gamme. `overrideTypes`
          // fixe le type à `GammeRow[]` (le `select` imbriqué brouille l'inférence).
          .select(
            '*, periodicites(id, libelle, jours_periodicite), ' +
              'prestataires(id, libelle), ' +
              'contrats_gammes!inner(contrats!inner(prestataire_id, site_id))',
          )
          .eq('contrats_gammes.contrats.prestataire_id', prestataireId)
          .eq('contrats_gammes.contrats.site_id', siteId)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
          .overrideTypes<GammeRow[], { merge: false }>()
        return data ?? []
      },
      staleTime: 60_000,
    }),

  /**
   * Ordres de travail du prestataire sur le site actif (compartimentage strict).
   * Champs requis par `OtStatutBadge` (statut/origine/date_prevue/tolerance_jours)
   * + le tri par urgence (date_cloture). Clé préfixée `ordres_travail` → invalidée
   * par les écritures d'OT. Liste lecture seule de l'onglet Ordres de travail.
   */
  ordresTravail: (prestataireId: string, siteId: string) =>
    queryOptions({
      queryKey: [
        'ordres_travail',
        'par-prestataire',
        prestataireId,
        siteId,
      ] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          // Champs requis par `OtCard` (`OtCardData`) + le tri par urgence
          // (`date_cloture`). On réutilise la carte OT de la liste : rendu identique.
          // Select sur UNE seule ligne : l'inférence de type supabase ne parse pas un
          // littéral concaténé (`+`) → elle renverrait un `GenericStringError`.
          .select(
            'id, statut, origine, date_prevue, date_cloture, tolerance_jours, nom_gamme, nom_equipement, description_gamme, miniature_id',
          )
          .eq('prestataire_id', prestataireId)
          .eq('site_id', siteId)
          .order('date_prevue', { ascending: false })
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
