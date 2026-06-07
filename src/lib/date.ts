const FR_DATE = new Intl.DateTimeFormat('fr-FR')
const FR_DATE_LONG = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

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
