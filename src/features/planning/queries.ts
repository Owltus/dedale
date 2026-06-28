import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * OT du site planifiés dans une fenêtre [debut, fin] (dates ISO `YYYY-MM-DD`),
 * pour la grille gamme × semaine. Lecture seule, non supprimés.
 */
export const planningQueries = {
  all: () => ['planning'] as const,

  fenetre: (siteId: string | null, debut: string, fin: string) =>
    queryOptions({
      queryKey: [...planningQueries.all(), 'fenetre', siteId, debut, fin],
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, origine, tolerance_jours, gamme_id, nom_gamme, nature_gamme, nom_prestataire, nom_equipement, description_gamme, libelle_periodicite, date_prevue, date_cloture, miniature_id',
          )
          .eq('site_id', siteId!)
          .gte('date_prevue', debut)
          .lte('date_prevue', fin)
          .order('date_prevue', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
