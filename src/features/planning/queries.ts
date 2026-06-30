import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * OT du site planifiés dans une fenêtre [debut, fin] (dates ISO `YYYY-MM-DD`),
 * pour la grille gamme × semaine. Lecture seule, non supprimés.
 */
export const planningQueries = {
  all: () => ['planning'] as const,

  /**
   * OT du site dont la DATE PRÉVUE tombe dans `[debut, fin]` (bornes = lundi de la 1ʳᵉ
   * semaine visible → dimanche de la dernière). Le planning positionne chaque OT sur sa
   * semaine PRÉVUE (cf. `dateSemaineOt`), donc on filtre directement sur `date_prevue` :
   * `[debut, fin]` couvre exactement les semaines affichées (calage lundi→dimanche).
   * Lecture seule.
   */
  fenetre: (siteId: string | null, debut: string, fin: string) =>
    queryOptions({
      queryKey: [...planningQueries.all(), 'fenetre', siteId, debut, fin],
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, origine, tolerance_jours, gamme_id, nom_gamme, nature_gamme, nom_prestataire, nom_equipement, description_gamme, nom_categorie, libelle_periodicite, date_prevue, date_debut, date_cloture, miniature_id',
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
