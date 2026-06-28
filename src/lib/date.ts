const FR_DATE = new Intl.DateTimeFormat('fr-FR')
const FR_DATE_LONG = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

/**
 * Date du jour au format ISO court `AAAA-MM-JJ` en heure LOCALE — pour
 * pré-remplir un `<input type="date">`. ⚠️ NE PAS utiliser
 * `new Date().toISOString()` : il renvoie l'UTC, donc la nuit en France
 * (UTC+1/+2) le champ se pré-remplirait à la VEILLE. `sv-SE` produit le format
 * ISO en respectant le fuseau local.
 */
export function todayLocal(): string {
  return new Date().toLocaleDateString('sv-SE')
}

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

/**
 * Numéro de semaine ISO 8601 (= convention française : la semaine commence le
 * LUNDI, et la semaine 1 est celle qui contient le 1er jeudi de l'année — donc le
 * 4 janvier). Renvoie 1 à 53, ou `null` si la date est vide/invalide.
 *
 * On lit les composantes calendaires LOCALES de la date (cohérentes avec
 * `formatDate`, qui formate en heure locale) puis on calcule en UTC pour
 * s'affranchir de l'heure d'été (deux jeudis consécutifs = exactement 7×24 h).
 */
export function numeroSemaineIso(
  value: string | Date | null | undefined,
): number | null {
  if (!value) return null
  const src = new Date(value)
  if (Number.isNaN(src.getTime())) return null
  // Jeudi de la semaine ISO de la date (lundi=0 … dimanche=6).
  const jeudi = new Date(
    Date.UTC(src.getFullYear(), src.getMonth(), src.getDate()),
  )
  jeudi.setUTCDate(jeudi.getUTCDate() - ((jeudi.getUTCDay() + 6) % 7) + 3)
  // Jeudi de la semaine 1 (semaine contenant le 4 janvier de l'année du jeudi).
  const premierJeudi = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4))
  premierJeudi.setUTCDate(
    premierJeudi.getUTCDate() - ((premierJeudi.getUTCDay() + 6) % 7) + 3,
  )
  return 1 + Math.round((jeudi.getTime() - premierJeudi.getTime()) / 604800000)
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
