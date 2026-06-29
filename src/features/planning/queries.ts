import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * OT du site planifiés dans une fenêtre [debut, fin] (dates ISO `YYYY-MM-DD`),
 * pour la grille gamme × semaine. Lecture seule, non supprimés.
 */
export const planningQueries = {
  all: () => ['planning'] as const,

  /**
   * OT du site dont la DATE EFFECTIVE (clôture → début → prévue, cf.
   * `dateEffectiveOt`) peut tomber dans `[debut, fin]`. On élargit le filtre aux
   * trois colonnes via `.or()` (PostgREST) : un OT clôturé loin de sa date prévue
   * doit remonter par sa date de clôture, et inversement. La page rebute ensuite
   * chaque OT sur sa SEULE date effective (sur-sélection inoffensive). `finExclu`
   * = lendemain de `fin` : borne haute des colonnes TIMESTAMPTZ (date_debut /
   * date_cloture incluent l'heure), pour ne pas tronquer le dernier jour.
   */
  fenetre: (
    siteId: string | null,
    debut: string,
    fin: string,
    finExclu: string,
  ) =>
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
          .or(
            `and(date_prevue.gte.${debut},date_prevue.lte.${fin}),` +
              `and(date_debut.gte.${debut},date_debut.lt.${finExclu}),` +
              `and(date_cloture.gte.${debut},date_cloture.lt.${finExclu})`,
          )
          .order('date_prevue', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
