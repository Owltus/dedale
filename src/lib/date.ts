const FR_DATE = new Intl.DateTimeFormat('fr-FR')
const FR_DATE_LONG = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

// ── Dates nues locales ────────────────────────────────────────────────────────
// Les dates métier (`date_prevue`, `date_debut`…) sont des dates NUES
// (`YYYY-MM-DD`) : on raisonne en jours entiers, en heure LOCALE, jamais en UTC
// (sinon décalage d'un jour près de minuit en France, UTC+1/+2). Famille
// canonique partagée par le planning, les badges OT et le tableau de bord.

/** Un jour en millisecondes — pour les écarts entre deux minuits UTC ou locaux. */
export const JOUR_MS = 24 * 60 * 60 * 1000

/** Minuit local d'une date donnée (copie, sans muter l'entrée). */
export function minuit(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Parse `YYYY-MM-DD` (ou ISO complet : seuls les 10 premiers caractères sont
 * lus) en Date LOCALE à minuit — jamais `new Date(iso)`, qui interprète la date
 * nue en UTC et la décale d'un jour selon le fuseau.
 */
export function parseDateLocale(value: string): Date {
  const [a, m, j] = value.slice(0, 10).split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1)
}

/**
 * `YYYY-MM-DD` d'une date en heure LOCALE (sans décalage de fuseau).
 * ⚠️ NE PAS utiliser `date.toISOString()` : il renvoie l'UTC, donc la nuit en
 * France (UTC+1/+2) la date basculerait à la VEILLE.
 */
export function isoLocale(date: Date): string {
  const a = String(date.getFullYear())
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const j = String(date.getDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

/**
 * Date du jour au format ISO court `AAAA-MM-JJ` en heure LOCALE — pour
 * pré-remplir un `<input type="date">` (cf. `isoLocale`).
 */
export function todayLocal(): string {
  return isoLocale(new Date())
}

/** Lundi (00:00 local) de la semaine ISO contenant `date`. Ne mute pas l'entrée. */
export function lundiDeLaSemaine(date: Date): Date {
  const d = minuit(date)
  // getDay() : 0 = dimanche … 6 = samedi → décalage vers lundi.
  const jour = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - jour)
  return d
}

/**
 * Décale une date de `n` jours (n négatif possible). Ne mute pas l'entrée.
 * Arithmétique CALENDAIRE (jour + n) et NON en millisecondes : `getTime() + n*JOUR_MS`
 * dérive d'±1 h à chaque changement d'heure (été/hiver) traversé. Le constructeur
 * `Date` normalise le dépassement de jour et reste à minuit local quel que soit le DST.
 */
export function ajouterJours(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
}

/** Décale une date de `n` semaines (n négatif possible). Cf. `ajouterJours`. */
export function ajouterSemaines(date: Date, n: number): Date {
  return ajouterJours(date, n * 7)
}

// ── Formats d'affichage ───────────────────────────────────────────────────────

/** Formate une date ISO ou un Date en JJ/MM/AAAA (fr). « — » si vide/invalide. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : FR_DATE.format(d)
}

/** Formate une date ISO ou un Date en format long (« 6 juin 2026 »). « — » si vide/invalide. */
export function formatDateLong(
  value: string | Date | null | undefined,
): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : FR_DATE_LONG.format(d)
}

// ── Semaines ISO 8601 ─────────────────────────────────────────────────────────

/**
 * Numéro ET année de semaine ISO 8601 d'une date (composantes calendaires
 * LOCALES). L'année ISO peut différer de l'année CIVILE en bord d'année
 * (ex. 29/12/2025 → semaine 1 de 2026 ; 01/01/2027 → semaine 53 de 2026) —
 * c'est elle qu'il faut pour clef/tri de colonnes de planning.
 *
 * Algorithme UNIQUE et précis (convention française : la semaine commence le
 * LUNDI, la semaine 1 contient le 1er jeudi de l'année — donc le 4 janvier) :
 * on lit les composantes calendaires locales puis on calcule en UTC pour
 * s'affranchir de l'heure d'été (deux jeudis consécutifs = exactement 7×24 h).
 */
export function semaineIso(date: Date): { numero: number; annee: number } {
  // Jeudi de la semaine ISO de la date (lundi=0 … dimanche=6).
  const jeudi = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  )
  jeudi.setUTCDate(jeudi.getUTCDate() - ((jeudi.getUTCDay() + 6) % 7) + 3)
  const annee = jeudi.getUTCFullYear()
  // Jeudi de la semaine 1 (semaine contenant le 4 janvier de l'année du jeudi).
  const premierJeudi = new Date(Date.UTC(annee, 0, 4))
  premierJeudi.setUTCDate(
    premierJeudi.getUTCDate() - ((premierJeudi.getUTCDay() + 6) % 7) + 3,
  )
  const numero =
    1 + Math.round((jeudi.getTime() - premierJeudi.getTime()) / (7 * JOUR_MS))
  return { numero, annee }
}

/**
 * Numéro de semaine ISO 8601 seul (1 à 53), ou `null` si la date est
 * vide/invalide. Même algorithme que `semaineIso` (source unique).
 */
export function numeroSemaineIso(
  value: string | Date | null | undefined,
): number | null {
  if (!value) return null
  const src = new Date(value)
  if (Number.isNaN(src.getTime())) return null
  return semaineIso(src).numero
}

/**
 * Formate une date en « JJ/MM/AAAA (SS) » où SS est le numéro de semaine ISO
 * (cf. `numeroSemaineIso`). « — » (sans semaine) si vide/invalide.
 */
export function formatDateAvecSemaineIso(
  value: string | Date | null | undefined,
): string {
  const base = formatDate(value)
  const semaine = numeroSemaineIso(value)
  return semaine === null ? base : `${base} (${String(semaine)})`
}
