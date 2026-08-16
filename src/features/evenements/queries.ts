import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'

export const evenementsQueries = {
  all: () => ['evenements'] as const,

  /**
   * Événements du site actif, du plus récent au plus ancien — c'est un journal :
   * ce qui vient d'arriver se lit en premier.
   *
   * Le local remonte AVEC sa hiérarchie (niveau, bâtiment) : « Stationnement »
   * seul ne situe rien dans un établissement qui en compte plusieurs. La
   * jointure imbriquée évite une requête par ligne — la hiérarchie
   * `batiments → niveaux → locaux` se parcourt en remontant.
   */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...evenementsQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('evenements')
          .select(
            '*, locaux(id, nom, niveaux(id, nom, batiments(id, nom))), equipements(id, nom)',
          )
          .eq('site_id', siteId)
          .order('date_evenement', { ascending: false })
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}

export const statutsEvenementsQueries = {
  /** Référentiel des statuts (IDs stables, transitions libres). */
  list: () =>
    referentielQueryOptions('statuts_evenements', 'id, nom, description', 'id'),
}
