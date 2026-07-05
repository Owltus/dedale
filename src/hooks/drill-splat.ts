/**
 * Helpers PURS partagés par les adaptateurs de drill par CHEMIN d'URL
 * (`useGammesDrill`, `useEquipementsDrill`, `useBiblioTreeDrill`). Ces trois hooks
 * ne diffèrent que par leur route TanStack typée (`getRouteApi` + littéral `to`) —
 * qu'on garde propre à chacun pour préserver le typage strict des routes — et par
 * la présence d'un préfixe d'onglet. La logique réellement dupliquée (et sujette
 * aux erreurs : découpage du `_splat`, réassemblage) vit ici, testée une seule fois.
 */

/**
 * Segments de CATÉGORIES portés par un `_splat` de route. `stripPrefix` retire le
 * 1er segment (l'onglet, cas Bibliothèque `/bibliotheque/<onglet>/<cat>/…`) ; sinon
 * tous les segments composent le chemin de catégories (cas Gammes / Équipements).
 */
export function splatCatSegs(
  splat: string | undefined,
  stripPrefix: boolean,
): string[] {
  const parts = (splat ?? '').split('/').filter(Boolean)
  return stripPrefix ? parts.slice(1) : parts
}

/**
 * Réassemble un `_splat` : préfixe éventuel (onglet) + segments de catégories +
 * feuille éventuelle (élément ouvert), joints par `/`.
 */
export function joinSplat(
  prefixParts: string[],
  segs: string[],
  leaf: string | undefined,
): string {
  return [
    ...prefixParts,
    ...segs,
    ...(leaf !== undefined ? [leaf] : []),
  ].join('/')
}
