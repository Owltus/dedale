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

export interface StatutAffichage {
  label: string
  tone: StatusTone
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

  if (t < lundiCourant.getTime()) return { label: 'En retard', tone: 'destructive' }
  if (t < lundiProchain.getTime()) return { label: 'Cette semaine', tone: 'yellow' }
  if (t < lundiDans2.getTime()) return { label: 'Semaine prochaine', tone: 'warning' }
  if (joursRestants <= 30) return { label: 'Ce mois-ci', tone: 'warning' }
  return { label: 'Mois prochain', tone: 'neutral' }
}
