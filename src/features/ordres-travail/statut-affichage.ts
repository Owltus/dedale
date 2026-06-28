import type { StatusTone } from '@/components/common/status-badge'
import { libelleStatutOt, statutOtTone } from './schemas'

// Tout en heure LOCALE : `date_prevue` est une date nue (`YYYY-MM-DD`), on
// raisonne en jours entiers, sans fuseau.
const JOUR_MS = 24 * 60 * 60 * 1000

/** Minuit local d'une date (copie, sans muter l'entrée). */
function minuit(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Parse `YYYY-MM-DD` (ou ISO) en Date locale à minuit. */
function parseDateLocale(value: string): Date {
  const [a, m, j] = value.slice(0, 10).split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1)
}

/** Lundi (00:00 local) de la semaine ISO contenant `date`. */
function lundiDeLaSemaine(date: Date): Date {
  const d = minuit(date)
  // getDay() : 0 = dimanche … 6 = samedi → décalage vers lundi.
  const jour = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - jour)
  return d
}

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
   * `true` quand le libellé est un statut TEMPOREL dérivé de la date (En retard,
   * Cette semaine, … Mois prochain) ; `false` pour un statut métier ou le repli
   * « Planifié / Programmé » (OT encore HORS fenêtre de tolérance). Sert à la
   * synthèse gamme (`statutAffichageGamme`) : un OT planifié non temporel = encore
   * loin → ne crée aucune urgence (la gamme se lit « À jour »).
   */
  temporel: boolean
}

/**
 * Statut d'AFFICHAGE d'un OT (libellé + couleur de pastille `StatusBadge`).
 *
 * - OT déjà engagé ou terminé (en_cours / cloture / annule / reouvert) → statut
 *   MÉTIER tel quel.
 * - OT planifié (pas encore commencé) → statut TEMPOREL selon le temps restant
 *   avant la date prévue, modulé par `tolerance_jours` (qui dépend de la
 *   périodicité) :
 *     • date encore au-delà de la fenêtre de tolérance → fallback « Planifié »
 *       (origine plan de maintenance) / « Programmé » (origine ponctuelle) ;
 *     • date dans la fenêtre (`date_prevue − aujourd'hui ≤ tolerance_jours`) →
 *       statut temporel raffiné : En retard / Cette semaine / Semaine prochaine /
 *       Ce mois-ci / Mois prochain.
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

  // Hors fenêtre de tolérance (encore trop loin) → fallback Planifié / Programmé.
  if (joursRestants > toleranceJours) return fallback

  // Dans la fenêtre → statut temporel : d'abord par semaine ISO, puis par seuils.
  const lundiCourant = lundiDeLaSemaine(today)
  const lundiProchain = new Date(lundiCourant.getTime() + 7 * JOUR_MS)
  const lundiDans2 = new Date(lundiCourant.getTime() + 14 * JOUR_MS)
  const t = cible.getTime()

  // En retard = date passée (avant le lundi courant) : MÊME fait que `niveauUrgenceOt`
  // (estPlanifieEnRetard), pour que badge et niveau d'urgence ne divergent jamais. On
  // repasse `today` (déjà résolu) et pas `params.aujourdHui` → une SEULE lecture
  // d'horloge dans toute la fonction (pas de bascule de semaine à minuit dim.→lun.).
  if (estPlanifieEnRetard({ statut, date_prevue: datePrevue }, today))
    return { label: 'En retard', tone: 'destructive', temporel: true }
  if (t < lundiProchain.getTime())
    return { label: 'Cette semaine', tone: 'yellow', temporel: true }
  if (t < lundiDans2.getTime())
    return { label: 'Semaine prochaine', tone: 'warning', temporel: true }
  if (joursRestants <= 30)
    return { label: 'Ce mois-ci', tone: 'warning', temporel: true }
  return { label: 'Mois prochain', tone: 'neutral', temporel: true }
}
