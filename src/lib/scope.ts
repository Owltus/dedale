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

/** Forme minimale d'une catégorie pour qualifier le niveau 2 + le périmètre. */
export interface CategorieNiveau {
  id: string
  parent_id: string | null
  site_id: string | null
}

/**
 * Sous-catégories de **niveau 2** valides pour une gamme de périmètre `siteId`,
 * appariées à leur catégorie RACINE parente. Une entrée est retenue si son
 * `parent_id` n'est pas nul ET que ce parent est une racine (`parent_id` nul)
 * présente dans le périmètre. Périmètre = commun (`site_id` NULL) OU même site
 * que la gamme — cohérent avec le trigger backend (gamme de site → catégorie
 * commune OU du même site).
 *
 * `categories` doit DÉJÀ être filtrée sur le scope (`gamme`/`mixte`) et
 * l'activité : cette fonction n'arbitre QUE le niveau 2 et le périmètre. L'ordre
 * d'entrée est préservé. Source de vérité unique partagée entre la query
 * `gammesQueries.sousCategories` et le panneau Bibliothèque, pour ne pas diverger.
 */
export function sousCategoriesNiveau2<T extends CategorieNiveau>(
  categories: T[],
  siteId: string | null,
): { sous: T; racine: T }[] {
  // Périmètre : commun + site courant (la RLS arbitre déjà la visibilité réelle).
  const inScope = categories.filter(
    (c) => c.site_id === null || c.site_id === siteId,
  )
  // Racines accessibles → qualifient le niveau 2 et nomment le parent.
  const racines = new Map(
    inScope.filter((c) => c.parent_id === null).map((c) => [c.id, c] as const),
  )
  return inScope.flatMap((c) => {
    if (c.parent_id === null) return []
    const racine = racines.get(c.parent_id)
    return racine ? [{ sous: c, racine }] : []
  })
}
