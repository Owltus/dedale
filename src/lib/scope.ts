// Périmètre de la Bibliothèque (et autres catalogues entreprise/site).
// 'all' = tout l'accessible, 'entreprise' = scope commun (site_id NULL),
// sinon un id de site. La valeur 'entreprise' colle à la valeur backend du scope.
export const SCOPE_ALL = 'all'
export const SCOPE_COMMUN = 'entreprise'

/** Vrai si une ligne (par son `site_id`) appartient au périmètre sélectionné. */
export function scopeMatches(scope: string, siteId: string | null): boolean {
  if (scope === SCOPE_ALL) return true
  if (scope === SCOPE_COMMUN) return siteId === null
  return siteId === scope
}

/**
 * Cible d'ajout selon le périmètre : `null` = Commun, `undefined` = « Tout »
 * (pas de cible unique), sinon l'id de site.
 */
export function scopeTarget(scope: string): string | null | undefined {
  if (scope === SCOPE_ALL) return undefined
  if (scope === SCOPE_COMMUN) return null
  return scope
}
