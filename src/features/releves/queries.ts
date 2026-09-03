import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gammesAvecReleves, type HistoriqueLigne } from './pipeline'

const SELECT_HISTORIQUE =
  '*, ordres_travail!inner(id, gamme_id, nom_gamme, date_prevue, date_cloture, site_id, miniature_id)'

async function fetchHistorique(
  siteId: string,
  signal: AbortSignal,
): Promise<HistoriqueLigne[]> {
  const { data } = await supabase
    .from('operations_execution')
    .select(SELECT_HISTORIQUE)
    .eq('ordres_travail.site_id', siteId)
    .eq('statut', 'terminee')
    .not('valeur_mesuree', 'is', null)
    .abortSignal(signal)
    .throwOnError()
    .overrideTypes<HistoriqueLigne[], { merge: false }>()
  return data ?? []
}

export const relevesQueries = {
  all: () => ['releves'] as const,

  /**
   * Historique COMPLET des relevés (mesures ET compteurs) d'un site — une seule
   * requête, tout le reste (séries temporelles, bandeau de stats) est calculé côté
   * client dans `pipeline.ts`, comme dans l'ancien système. Même patron que
   * `relevesListe` (ordres-travail/queries.ts), volontairement plus large : pas de
   * filtre sur les seuils ni sur la nature cumulative, on veut TOUT. Utilisée par la
   * page détail (filtrée côté client sur la gamme choisie).
   */
  historique: (siteId: string | null) =>
    queryOptions({
      queryKey: [...relevesQueries.all(), 'historique', siteId] as const,
      enabled: siteId !== null,
      queryFn: ({ signal }) => fetchHistorique(siteId!, signal),
      staleTime: 60_000,
    }),

  /**
   * Résumé par gamme (page liste) — requête ET clé propres (contrainte de
   * `SlugDetailRoute` : la query passée en `options` doit renvoyer directement le
   * type de la liste, pas un `select` dérivé). Coûte un second aller-retour réseau
   * par rapport à `historique`, mais reste une requête simple scoper site.
   */
  gammesListe: (siteId: string | null) =>
    queryOptions({
      queryKey: [...relevesQueries.all(), 'gammes-liste', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) =>
        gammesAvecReleves(await fetchHistorique(siteId!, signal)),
      staleTime: 60_000,
    }),

  /**
   * Localisations distinctes des équipements liés à une gamme, pour le champ
   * « Localisation » du bandeau de stats. Une gamme peut être liée à PLUSIEURS
   * équipements (table N–N `gammes_equipements`) — à la différence de l'ancien
   * système (1 maintenance = 1 lieu), on affiche donc la liste des localisations
   * distinctes plutôt qu'un lieu unique.
   */
  localisationGamme: (gammeId: string | null) =>
    queryOptions({
      queryKey: [...relevesQueries.all(), 'localisation', gammeId] as const,
      enabled: gammeId !== null,
      queryFn: async ({ signal }) => {
        const { data: liens } = await supabase
          .from('gammes_equipements')
          .select('equipement_id')
          .eq('gamme_id', gammeId!)
          .abortSignal(signal)
          .throwOnError()
        const ids = liens.map((l) => l.equipement_id)
        if (ids.length === 0) return null
        const { data: equipements } = await supabase
          .from('v_equipements_complet')
          .select('localisation_complete')
          .in('id', ids)
          .abortSignal(signal)
          .throwOnError()
        const noms = [
          ...new Set(
            equipements
              .map((e) => e.localisation_complete)
              .filter((v): v is string => Boolean(v)),
          ),
        ]
        return noms.length > 0 ? noms.join(' · ') : null
      },
      staleTime: 60_000,
    }),
}
