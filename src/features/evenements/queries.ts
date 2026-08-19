import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'

export const evenementsQueries = {
  all: () => ['evenements'] as const,

  /**
   * Événements du site actif, du plus récent au plus ancien — c'est un journal :
   * ce qui vient d'arriver se lit en premier.
   *
   * 086 : plus de jointure locaux/équipements ici — le lieu vit désormais dans
   * `evenements_lieux` (0..N), récupéré séparément via `lieux()`, comme les
   * zones de travaux (`travauxQueries.taches`).
   */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...evenementsQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('evenements')
          .select('*')
          .eq('site_id', siteId)
          .order('date_evenement', { ascending: false })
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Lieux concernés par un événement (local + équipement optionnel). */
  lieux: (evenementId: string) =>
    queryOptions({
      queryKey: [...evenementsQueries.all(), 'lieux', evenementId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('evenements_lieux')
          .select(
            'id, ordre, local_id, equipement_id, created_at, locaux(id, nom), equipements(id, nom)',
          )
          .eq('evenement_id', evenementId)
          .order('ordre')
          .order('created_at')
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
