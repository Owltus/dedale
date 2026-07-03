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
 * Vrai si une ligne est visible depuis un site : elle est COMMUNE (`site_id`
 * NULL) ou appartient au site actif. C'est le prédicat de périmètre standard
 * des catalogues (catégories, modèles…) — la RLS arbitre déjà la visibilité
 * réelle, ce filtre garde la cohérence d'UI quand plusieurs sites sont
 * accessibles.
 */
export function estCommunOuDuSite(
  row: { site_id: string | null },
  siteId: string | null,
): boolean {
  return row.site_id === null || row.site_id === siteId
}

/** Portée d'un élément de catalogue : commun (`entreprise`) ou site actif. */
export type Portee = 'entreprise' | 'site'

/**
 * Périmètre imposé par le contexte d'une modale de catalogue (ex. création
 * depuis le + de la page) : la portée n'est plus un choix du formulaire.
 */
export interface LockedScope {
  portee: Portee
  siteId: string | null
}

/**
 * `site_id` à écrire pour une portée de formulaire : commun (`entreprise`) →
 * NULL, sinon le site actif. Réciproque de `porteeDeSiteId` implicite
 * (`site_id === null ? 'entreprise' : 'site'`).
 */
export function siteIdPourPortee(
  portee: Portee,
  siteId: string | null,
): string | null {
  return portee === SCOPE_COMMUN ? null : siteId
}

export interface PorteeScopeParams {
  /**
   * Portée à évaluer : celle du FORMULAIRE en cours de saisie (dérivés
   * d'affichage), ou la portée PAR DÉFAUT du schéma (calcul de `porteeInitiale`
   * dans `initialValues`).
   */
  portee: Portee
  /** Site actif (null si aucun). */
  siteId: string | null
  /** Droit de créer/éditer sur le scope entreprise (admin/manager). */
  canEntreprise: boolean
  /** Périmètre verrouillé par le contexte (création depuis le + de la page). */
  lockedScope?: LockedScope | null
  /** Édition d'un élément existant (vs création). */
  isEdit: boolean
}

export interface PorteeScopeResolue {
  /**
   * Portée initiale d'une CRÉATION : celle du périmètre verrouillé si fourni,
   * sinon la portée passée (défaut du schéma) si le rôle a le scope entreprise,
   * sinon `site`.
   */
  porteeInitiale: Portee
  /**
   * Option « Commun » visible : on en a le droit, ou la valeur courante l'est
   * déjà (lecture d'une entrée entreprise existante).
   */
  showEntreprise: boolean
  /** Sélecteur « Portée » masqué : création sous périmètre verrouillé. */
  hidePortee: boolean
  /** Périmètre de l'image (`MiniatureField.targetSiteId`) : pool commun ou site. */
  miniatureSite: string | null
  /**
   * Téléversement d'image autorisé : sur le commun pour les rôles entreprise,
   * sur un site pour tout éditeur.
   */
  canUploadMiniature: boolean
  /** `siteId` à passer à la mutation de CRÉATION (périmètre verrouillé ou site actif). */
  createSiteId: string | null
}

/**
 * Dérivés de portée/périmètre partagés par les modales de catalogue de la
 * Bibliothèque (catégorie, modèle d'équipement, modèle d'opération, modèle de
 * DI) : source unique du trio portée initiale / visibilité des options /
 * périmètre d'image, pour que les quatre formulaires ne divergent jamais.
 */
export function resolvePorteeScope({
  portee,
  siteId,
  canEntreprise,
  lockedScope,
  isEdit,
}: PorteeScopeParams): PorteeScopeResolue {
  const miniatureSite = siteIdPourPortee(portee, siteId)
  return {
    porteeInitiale: lockedScope
      ? lockedScope.portee
      : canEntreprise
        ? portee
        : 'site',
    showEntreprise: canEntreprise || portee === SCOPE_COMMUN,
    hidePortee: !isEdit && lockedScope != null,
    miniatureSite,
    canUploadMiniature: miniatureSite === null ? canEntreprise : true,
    createSiteId: lockedScope ? lockedScope.siteId : siteId,
  }
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
  const inScope = categories.filter((c) => estCommunOuDuSite(c, siteId))
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
