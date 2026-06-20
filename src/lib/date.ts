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
