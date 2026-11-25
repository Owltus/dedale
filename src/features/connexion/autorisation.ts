/**
 * `autorisation` : identifiant d'une demande d'accès du connecteur Claude
 * (écran /oauth/consent) à reprendre après la connexion. On ne garde QUE cet
 * identifiant, jamais une adresse de retour : pas de redirection ouverte.
 */
const AUTORISATION = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Valeur d'`autorisation` utilisable, ou `undefined`.
 *
 * À relire à CHAQUE usage, pas seulement dans `validateSearch` : TanStack
 * Router fusionne la recherche brute et la recherche validée, donc une valeur
 * refusée (`{}`) reste lisible par `useSearch()` et par `beforeLoad`.
 */
export function autorisationValide(valeur: unknown): string | undefined {
  return typeof valeur === 'string' && AUTORISATION.test(valeur)
    ? valeur
    : undefined
}
