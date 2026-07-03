import type { StatusTone } from '@/components/common/status-badge'
import { libelleStatutOt, statutOtTone } from './schemas'
// Dates nues locales (`date_prevue` = `YYYY-MM-DD`) : on raisonne en jours entiers,
// sans fuseau. Source unique des primitives de date → cf. `@/lib/date`.
import { JOUR_MS, lundiDeLaSemaine, minuit, parseDateLocale } from '@/lib/date'

/**
 * Niveau d'URGENCE d'un OT, ORDONNÉ du plus urgent (0) au moins urgent (4). C'est la
 * source UNIQUE de l'urgence : le TRI (`trierOtParUrgence`) s'en sert comme rang de
 * groupe, la synthèse d'un conteneur (`statutAffichageAgrege`) comme SEUIL (« urgent »
 * = niveau ≤ En cours). Dérivé de l'état STRUCTUREL (statut + date), JAMAIS de la
 * couleur du badge → recolorer un statut ne déplace plus ni le tri ni l'agrégation.
 */
export const NIVEAU_URGENCE = {
  reouvert: 0,
  enRetard: 1,
  enCours: 2,
  aVenir: 3,
  termine: 4,
} as const
export type NiveauUrgence =
  (typeof NIVEAU_URGENCE)[keyof typeof NIVEAU_URGENCE]

/**
 * Un OT planifié est-il EN RETARD ? → sa date prévue est antérieure au lundi de la
 * semaine ISO courante. Fait structurel PARTAGÉ par le badge (« En retard ») et le
 * niveau d'urgence, pour qu'ils ne puissent JAMAIS diverger.
 */
export function estPlanifieEnRetard(
  ot: { statut: string; date_prevue: string | null },
  aujourdHui?: Date,
): boolean {
  if (ot.statut !== 'planifie' || !ot.date_prevue) return false
  const lundi = lundiDeLaSemaine(minuit(aujourdHui ?? new Date()))
  return parseDateLocale(ot.date_prevue).getTime() < lundi.getTime()
}

/**
 * Niveau d'urgence d'un OT (cf. `NIVEAU_URGENCE`). Réouvert et En cours sont des états
 * métier ; un OT terminal (clôturé/annulé) est au plus bas ; un OT planifié est En
 * retard si sa date est passée, sinon À venir. La PROXIMITÉ (Cette semaine, Ce
 * mois-ci…) est une nuance de PRÉSENTATION, pas d'urgence : tous ces OT sont « À venir »
 * et se départagent ensuite par DATE (cf. `trierOtParUrgence`).
 */
export function niveauUrgenceOt(
  ot: { statut: string; date_prevue: string | null },
  aujourdHui?: Date,
): NiveauUrgence {
  switch (ot.statut) {
    case 'reouvert':
      return NIVEAU_URGENCE.reouvert
    case 'en_cours':
      return NIVEAU_URGENCE.enCours
    case 'cloture':
    case 'annule':
      return NIVEAU_URGENCE.termine
    default:
      return estPlanifieEnRetard(ot, aujourdHui)
        ? NIVEAU_URGENCE.enRetard
        : NIVEAU_URGENCE.aVenir
  }
}

export interface StatutAffichage {
  label: string
  tone: StatusTone
  /**
   * IMMINENCE MÉTIER de l'OT — DÉCOUPLÉE du libellé. Le libellé reflète toujours la
   * proximité CALENDAIRE réelle (Cette semaine, Ce mois-ci…) ; `temporel` dit si cette
   * échéance tombe dans la fenêtre de `tolerance_jours` (qui dépend de la périodicité).
   * Sert UNIQUEMENT à la synthèse gamme (`statutAffichageGamme`) : prochain OT planifié
   * hors tolérance (`temporel: false`) = rien d'imminent → la gamme se lit « À jour ».
   * `false` aussi pour tout statut métier ou le repli « Planifié / Programmé ».
   */
  temporel: boolean
}

/**
 * Statut d'AFFICHAGE d'un OT (libellé + couleur de pastille `StatusBadge`).
 *
 * - OT déjà engagé ou terminé (en_cours / cloture / annule / reouvert) → statut
 *   MÉTIER tel quel.
 * - OT planifié (pas encore commencé) → statut TEMPOREL selon la PROXIMITÉ
 *   CALENDAIRE de la date prévue, indépendamment de la périodicité :
 *     • date à plus de ~2 mois → repli « Planifié » (plan de maintenance) /
 *       « Programmé » (ponctuel) ;
 *     • sinon, libellé de proximité : En retard / Cette semaine / Semaine prochaine /
 *       Ce mois-ci / Mois prochain.
 *   `tolerance_jours` ne pilote PLUS le libellé (un OT proche à petite tolérance
 *   affichait à tort « Programmé », paraissant moins urgent qu'un OT plus lointain à
 *   grande tolérance) : elle ne renseigne plus que le flag `temporel` (synthèse gamme).
 *
 * 100 % dérivé (aucune donnée backend) : recalculé à chaque rendu → toujours
 * juste, sans table ni job de recalcul.
 */
export function statutAffichageOt(params: {
  statut: string
  origine?: string | null
  datePrevue: string | null
  toleranceJours: number
  /** Aujourd'hui (injectable pour les tests) ; défaut = maintenant. */
  aujourdHui?: Date
}): StatutAffichage {
  const { statut, origine, datePrevue, toleranceJours } = params
  const ori = origine ?? undefined
  const fallback: StatutAffichage = {
    label: libelleStatutOt(statut, ori),
    tone: statutOtTone(statut, ori),
    temporel: false,
  }

  // Statut métier pour un OT déjà engagé/terminé, ou date prévue manquante.
  if (statut !== 'planifie' || !datePrevue) return fallback

  const today = minuit(params.aujourdHui ?? new Date())
  const cible = parseDateLocale(datePrevue)
  const joursRestants = Math.round(
    (cible.getTime() - today.getTime()) / JOUR_MS,
  )

  // Au-delà de ~2 mois : rien d'imminent à signaler → repli « Planifié / Programmé »
  // (non temporel → la gamme se lira « À jour »). Le SEUIL est désormais CALENDAIRE
  // (60 j) et non plus la tolérance : sinon un OT proche à petite tolérance retombait
  // à tort sur « Programmé ». Placé APRÈS l'écart : un OT EN RETARD (jours négatifs)
  // n'est jamais renvoyé ici.
  if (joursRestants > 60) return fallback

  // `temporel` = imminence MÉTIER : l'échéance tombe dans la fenêtre de tolérance (qui
  // dépend de la périodicité). DÉCOUPLÉ du libellé ci-dessous (proximité calendaire) →
  // ne pilote QUE la synthèse gamme (« À jour » tant que le prochain OT est hors tolérance).
  const temporel = joursRestants <= toleranceJours

  // Libellé = proximité CALENDAIRE réelle : d'abord par semaine ISO, puis par seuils.
  const lundiCourant = lundiDeLaSemaine(today)
  const lundiProchain = new Date(lundiCourant.getTime() + 7 * JOUR_MS)
  const lundiDans2 = new Date(lundiCourant.getTime() + 14 * JOUR_MS)
  const t = cible.getTime()

  // En retard = date passée (avant le lundi courant) : MÊME fait que `niveauUrgenceOt`
  // (estPlanifieEnRetard), pour que badge et niveau d'urgence ne divergent jamais. On
  // repasse `today` (déjà résolu) et pas `params.aujourdHui` → une SEULE lecture
  // d'horloge dans toute la fonction (pas de bascule de semaine à minuit dim.→lun.).
  if (estPlanifieEnRetard({ statut, date_prevue: datePrevue }, today))
    return { label: 'En retard', tone: 'destructive', temporel }
  if (t < lundiProchain.getTime())
    return { label: 'Cette semaine', tone: 'yellow', temporel }
  if (t < lundiDans2.getTime())
    return { label: 'Semaine prochaine', tone: 'warning', temporel }
  if (joursRestants <= 30)
    return { label: 'Ce mois-ci', tone: 'warning', temporel }
  return { label: 'Mois prochain', tone: 'warning', temporel }
}

/**
 * Statut d'affichage d'un OT POUR LE PLANNING — volontairement DÉPOUILLÉ des nuances
 * de proximité calendaire (« Cette semaine », « Semaine prochaine », « Ce mois-ci »,
 * « Mois prochain », « À venir »). Sur un calendrier mural, la POSITION de la case dit
 * déjà QUAND tombe l'OT : ces libellés feraient doublon (décision PO). Il ne reste donc
 * que :
 *   - le statut MÉTIER : En cours / Clôturé / Annulé / Rouvert ;
 *   - l'ORIGINE d'un OT à venir : Planifié (violet, date posée par un humain) /
 *     Programmé (gris) — NB : la grille repeint « Programmé » en JAUNE dans la SEULE
 *     colonne de la semaine courante (sinon le gris se noie dans son surlignage
 *     `bg-accent`) ; les semaines futures restent grises (cf. `planning-grille`) ;
 *   - l'unique fait temporel CONSERVÉ : « En retard » (rouge) pour un OT planifié dont
 *     la date est dépassée — MÊME fait que `estPlanifieEnRetard`, donc le coloriage du
 *     planning et le niveau d'urgence / le tri ne peuvent jamais diverger.
 *
 * Contrepartie RICHE (cartes de liste + fiche détail) : `statutAffichageOt`, INCHANGÉE.
 * 100 % dérivé, aucune donnée backend.
 */
export function statutPlanningOt(params: {
  statut: string
  origine?: string | null
  datePrevue: string | null
  /** Aujourd'hui (injectable pour les tests) ; défaut = maintenant. */
  aujourdHui?: Date
}): { label: string; tone: StatusTone } {
  const ori = params.origine ?? undefined
  // `estPlanifieEnRetard` ne renvoie `true` que pour un OT planifié à date dépassée
  // (et garde déjà les autres statuts / date absente) → un seul test suffit.
  if (
    estPlanifieEnRetard(
      { statut: params.statut, date_prevue: params.datePrevue },
      params.aujourdHui,
    )
  )
    return { label: 'En retard', tone: 'destructive' }
  return {
    label: libelleStatutOt(params.statut, ori),
    tone: statutOtTone(params.statut, ori),
  }
}
