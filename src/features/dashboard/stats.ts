import { estVerrouille } from '@/features/ordres-travail/schemas'
import { estPlanifieEnRetard } from '@/features/ordres-travail/statut-affichage'
import { cleSemaine } from '@/features/planning/semaines'
import { parseDateLocale } from '@/lib/date'

/** OT tel que renvoyé par `ordresTravailQueries.list` (sous-ensemble utilisé ici). */
interface OtRow {
  statut: string
  nom_gamme: string | null
  date_prevue: string | null
  date_cloture: string | null
}

export interface OtKpis {
  total: number
  enRetard: number
  cetteSemaine: number
  enCours: number
}

// Tout se raisonne en heure LOCALE : `date_prevue` est une date nue (`YYYY-MM-DD`),
// on ne compare JAMAIS en UTC (sinon décalage d'un jour près de minuit, incohérent
// avec les badges de liste). La définition canonique « en retard » vit dans
// `statut-affichage.ts` (`estPlanifieEnRetard`) et est réutilisée telle quelle ici.
// `parseDateLocale` vient de `@/lib/date` (famille canonique des dates nues).

/**
 * Compteurs d'OT (donut « reste à faire »), DÉRIVÉS des helpers canoniques pour que
 * les chiffres du tableau de bord == les badges des listes OT :
 * - « total » (à faire) : OT non verrouillés (exclut clôturés / annulés) ;
 * - « en retard » : `estPlanifieEnRetard` (planifié dont la date est antérieure au
 *   lundi de la semaine ISO courante, en heure LOCALE) ;
 * - « cette semaine » : OT non verrouillé dont la date prévue tombe dans la semaine
 *   ISO courante (même clé de semaine que maintenant) ;
 * - « en cours » : statut « en_cours » ou « reouvert ».
 */
export function calculerKpisOt(ots: readonly OtRow[]): OtKpis {
  const cleCourante = cleSemaine(new Date())
  let total = 0
  let enRetard = 0
  let cetteSemaine = 0
  let enCours = 0

  for (const ot of ots) {
    if (!estVerrouille(ot.statut)) total += 1
    if (ot.statut === 'en_cours' || ot.statut === 'reouvert') enCours += 1
    if (estPlanifieEnRetard(ot)) enRetard += 1
    if (
      ot.date_prevue &&
      !estVerrouille(ot.statut) &&
      cleSemaine(parseDateLocale(ot.date_prevue)) === cleCourante
    )
      cetteSemaine += 1
  }

  return { total, enRetard, cetteSemaine, enCours }
}
