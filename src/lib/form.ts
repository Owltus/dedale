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
 * Message clair pour une copie commun → site refusée (RPC `copier_*` :
 * `copier_gamme` ET `copier_categorie`). Traduit les codes Postgres remontés au
 * lieu d’afficher le message technique brut de la RPC ; repli sur `errorMessage`
 * pour le reste. Neutre quant à l’élément copié (catégorie ou gamme).
 * - `42501` : RLS, site cible hors périmètre.
 * - `23505` : élément du même nom déjà présent sur le site cible (copie déjà faite ?).
 * - `P0002` : élément source (catégorie ou gamme) introuvable (supprimé pendant l’opération).
 */
export function exportErrorMessage(e: unknown): string {
  const code = pgCode(e)
  if (code === '42501') {
    return 'Action non autorisée : vous n’avez pas accès à ce site.'
  }
  if (code === '23505') {
    return 'Un élément du même nom existe déjà sur ce site (copie déjà effectuée ?).'
  }
  if (code === 'P0002') {
    return 'L’élément source (catégorie ou gamme) est introuvable ou a été supprimé. Rafraîchis la liste puis réessaie.'
  }
  return errorMessage(e)
}

/**
 * Message clair pour une SUPPRESSION refusée : traduit les codes Postgres/PostgREST
 * au lieu du message technique brut. À utiliser dans les `onError` des suppressions.
 * - `42501` (RLS) / `PGRST116` (0 ligne touchée) : hors périmètre, ou déjà supprimé.
 * - `23503` : encore référencé par une FK RESTRICT → dissocier d’abord.
 * - `restrict_violation` (23001) : le message FR de la base est déjà explicite → tel quel.
 */
export function deleteErrorMessage(e: unknown): string {
  const code = pgCode(e)
  if (code === '42501' || code === 'PGRST116') {
    return 'Action impossible : élément hors de votre périmètre, ou déjà supprimé.'
  }
  if (code === '23503') {
    return 'Cet élément est encore lié à d’autres données : dissociez-les d’abord.'
  }
  return errorMessage(e)
}
