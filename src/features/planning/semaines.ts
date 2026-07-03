/**
 * Utilitaires de semaines ISO 8601 (lundi → dimanche) pour la grille du planning.
 * Tout en heure locale : `date_prevue` est une date nue (`YYYY-MM-DD`), on
 * raisonne en jours, sans fuseau. Les primitives de dates nues (lundi de la
 * semaine, `YYYY-MM-DD` local, décalage de semaines, numéro/année ISO) viennent
 * de la famille canonique `@/lib/date` — pas de copie locale.
 */
import {
  ajouterSemaines,
  formatDate,
  isoLocale,
  lundiDeLaSemaine,
  semaineIso,
} from '@/lib/date'

// Ré-export pour les consommateurs historiques du planning et du tableau de bord
// qui importent ces primitives depuis ce module.
export { ajouterSemaines, isoLocale, lundiDeLaSemaine }

export interface SemaineIso {
  /** Numéro de semaine ISO (1–53). */
  numero: number
  /** Année ISO (peut différer de l'année calendaire en bord d'année). */
  annee: number
  /** Lundi de la semaine (00:00 local). */
  debut: Date
  /** `YYYY-MM-DD` du lundi (borne basse de la fenêtre). */
  debutIso: string
  /** Clé stable « annee-numero » pour les colonnes. */
  cle: string
}

/** Clé « annee-numero » à partir des deux nombres ISO. */
function formatCle(annee: number, numero: number): string {
  return `${String(annee)}-${String(numero)}`
}

/** Clé « annee-numero » d'une date prévue, pour ranger l'OT dans sa colonne. */
export function cleSemaine(date: Date): string {
  const { numero, annee } = semaineIso(date)
  return formatCle(annee, numero)
}

/**
 * Fenêtre de `nbSemaines` semaines ISO consécutives à partir de la semaine
 * contenant `depart` (incluse).
 */
export function fenetreSemaines(
  depart: Date,
  nbSemaines: number,
): SemaineIso[] {
  const lundi = lundiDeLaSemaine(depart)
  const semaines: SemaineIso[] = []
  for (let i = 0; i < nbSemaines; i++) {
    // Arithmétique CALENDAIRE (jour + i×7, via `ajouterSemaines`), PAS `getTime() +
    // i*7*JOUR` en ms : cette dernière dérive d'±1 h à chaque changement d'heure
    // (été/hiver), si bien que les semaines lointaines tombaient un DIMANCHE → le
    // numéro ISO était renvoyé au mauvais numéro (doublons → clés React en double →
    // affichage corrompu). `ajouterSemaines` reste à minuit local.
    const debut = ajouterSemaines(lundi, i)
    const { numero, annee } = semaineIso(debut)
    semaines.push({
      numero,
      annee,
      debut,
      debutIso: isoLocale(debut),
      cle: formatCle(annee, numero),
    })
  }
  return semaines
}

/**
 * Libellé compact de la période visible : « 2025 · S10–S22 » (ou
 * « 2025 · S50 → 2026 · S03 » à cheval sur deux années ISO).
 */
export function formatPeriode(semaines: SemaineIso[]): string {
  const premiere = semaines[0]
  const derniere = semaines[semaines.length - 1]
  if (!premiere || !derniere) return ''
  if (premiere.annee === derniere.annee) {
    return `${String(premiere.annee)} · S${String(premiere.numero)}–S${String(derniere.numero)}`
  }
  return `${String(premiere.annee)} · S${String(premiere.numero)} → ${String(derniere.annee)} · S${String(derniere.numero)}`
}

/** Libellé d'une semaine pour un titre / une infobulle : « S24 — semaine du 09/06/2026 ». */
export function labelSemaine(s: SemaineIso): string {
  return `S${String(s.numero)} — semaine du ${formatDate(s.debut)}`
}

/**
 * Clés de semaine (« annee-numero ») des `nbSemaines` semaines à partir de
 * `depart` — pour tester l'appartenance d'un OT à une plage (ex. « Focus 12
 * semaines » : familles ayant au moins un OT dans les 12 prochaines semaines).
 */
export function clesProchaines(depart: Date, nbSemaines: number): Set<string> {
  return new Set(fenetreSemaines(depart, nbSemaines).map((s) => s.cle))
}
