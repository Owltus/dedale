import type { ZodError } from 'zod'

/** Map les erreurs Zod par nom de champ (première erreur rencontrée par champ). */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !(key in out)) {
      out[key] = issue.message
    }
  }
  return out
}

/** Message lisible d'une erreur inconnue (ex. erreur Supabase/RLS). */
export function errorMessage(
  e: unknown,
  fallback = 'Une erreur est survenue',
): string {
  return e instanceof Error ? e.message : fallback
}

/** Code SQLSTATE d'une erreur Supabase, si disponible. */
export function pgCode(e: unknown): string | undefined {
  return e !== null &&
    typeof e === 'object' &&
    'code' in e &&
    typeof e.code === 'string'
    ? e.code
    : undefined
}

/**
 * Message clair pour une copie commun → site refusée (RPC `copier_*`). Traduit le
 * `42501` (RLS : site cible hors périmètre) au lieu d'afficher le message
 * technique brut de la RPC ; repli sur `errorMessage` pour le reste.
 */
export function exportErrorMessage(e: unknown): string {
  if (pgCode(e) === '42501') {
    return 'Action non autorisée : vous n’avez pas accès à ce site.'
  }
  return errorMessage(e)
}
