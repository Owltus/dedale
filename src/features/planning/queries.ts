import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isoLocale } from '@/features/planning/semaines'

/** Décale une date ISO nue (`YYYY-MM-DD`) de `delta` jours, en heure locale. */
function decalerJourIso(iso: string, delta: number): string {
  const [a, m, j] = iso.split('-').map(Number)
  return isoLocale(new Date(a ?? 1970, (m ?? 1) - 1, (j ?? 1) + delta))
}

/**
 * OT du site planifiés dans une fenêtre [debut, fin] (dates ISO `YYYY-MM-DD`),
 * pour la grille gamme × semaine. Lecture seule, non supprimés.
 */
export const planningQueries = {
  all: () => ['planning'] as const,

  /**
   * OT du site TOMBANT dans `[debut, fin]` (bornes = lundi de la 1ʳᵉ semaine visible →
   * dimanche de la dernière) par leur date de POSITIONNEMENT (cf. `dateSemaineOt`) :
   * date PRÉVUE pour un OT en cours de vie, date de CLÔTURE pour un OT terminal
   * (clôturé/annulé, potentiellement fait en retard/avance hors de sa semaine prévue).
   * D'où le `.or()` sur les deux dates.
   *
   * Les bornes de `date_cloture` (TIMESTAMPTZ) sont ÉLARGIES d'un jour de chaque côté
   * pour absorber l'écart de fuseau (le filtre serveur compare en heure serveur) ; le
   * tri fin par semaine LOCALE est refait côté client (`otsFenetre`), donc ce léger
   * sur-fetch aux bords est sans effet visible. Lecture seule.
   */
  fenetre: (siteId: string | null, debut: string, fin: string) =>
    queryOptions({
      queryKey: [...planningQueries.all(), 'fenetre', siteId, debut, fin],
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const debutCloture = decalerJourIso(debut, -1)
        const finCloture = decalerJourIso(fin, 1)
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, origine, tolerance_jours, gamme_id, nom_gamme, nature_gamme, nom_prestataire, nom_equipement, description_gamme, nom_categorie, libelle_periodicite, date_prevue, date_debut, date_cloture, miniature_id',
          )
          .eq('site_id', siteId!)
          .or(
            `and(date_prevue.gte.${debut},date_prevue.lte.${fin}),` +
              `and(date_cloture.gte.${debutCloture},date_cloture.lte.${finCloture})`,
          )
          .order('date_prevue', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
