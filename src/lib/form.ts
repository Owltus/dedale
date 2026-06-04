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
