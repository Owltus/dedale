/**
 * Identifiant d'une demande d'accès du connecteur Claude (serveur OAuth de
 * Supabase Auth) : `authorization_id` sur /oauth/consent, `autorisation` sur
 * /login. On ne garde QUE cet identifiant, jamais une adresse de retour : pas
 * de redirection ouverte.
 */
const IDENTIFIANT_OAUTH = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Valeur utilisable, ou `undefined`.
 *
 * À appliquer à CHAQUE lecture, pas seulement dans `validateSearch` : TanStack
 * Router fusionne la recherche brute et la recherche validée, donc une valeur
 * refusée (`{}`) reste lisible par `useSearch()` et par `beforeLoad`.
 */
export function identifiantOAuthValide(valeur: unknown): string | undefined {
  return typeof valeur === 'string' && IDENTIFIANT_OAUTH.test(valeur)
    ? valeur
    : undefined
}
