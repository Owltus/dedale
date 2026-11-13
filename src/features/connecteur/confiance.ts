/**
 * Adresses de retour acceptées pour le connecteur Claude (anti-hameçonnage).
 *
 * L'inscription des applications OAuth est publique : n'importe qui peut en
 * inscrire une nommée « Claude ». Ce qui la trahit, c'est l'adresse où elle
 * demande à être renvoyée. Une vraie connexion Claude revient vers claude.ai,
 * claude.com, ou l'ordinateur de la personne (Claude Code, localhost).
 *
 * MIROIR de public.client_ia_de_confiance() (migration 154), qui fait
 * autorité : même autorisée ici par erreur, une autre application ne verrait
 * rien. Les deux listes doivent rester identiques.
 */
export function retourDeConfiance(adresse: string): boolean {
  let url: URL
  try {
    url = new URL(adresse)
  } catch {
    return false
  }
  if (url.username || url.password) return false
  if (url.protocol === 'https:')
    return (
      (url.hostname === 'claude.ai' || url.hostname === 'claude.com') &&
      url.port === ''
    )
  if (url.protocol === 'http:')
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  return false
}

/** Nom lisible du lieu de retour, pour l'écran d'autorisation. */
export function lieuDeRetour(adresse: string): string {
  try {
    const { hostname } = new URL(adresse)
    return hostname === 'localhost' || hostname === '127.0.0.1'
      ? 'ton ordinateur (Claude Code)'
      : hostname
  } catch {
    return 'adresse illisible'
  }
}
