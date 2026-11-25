import { segOfUnique } from '@/lib/slug'
import { useTreeDrill, type DrillRoute, type TreeNode } from './use-tree-drill'
import { useLeafResync } from './use-leaf-resync'

/**
 * Id sentinelle du bac « Non classé » (catégorie VIRTUELLE, hors base) : regroupe
 * à la racine les éléments du site sans catégorie visible (legacy/import, ou
 * rangés dans une catégorie non affichée ici) pour ne JAMAIS les cacher.
 */
export const NON_CLASSE_ID = '__non_classe__'

/**
 * Projection minimale d'une catégorie pour le DRILL des explorateurs de catalogue
 * (Plan de maintenance, Équipements) : les champs lus à l'affichage + `parent_id`
 * pour l'arbre, plus un drapeau `virtual` pour le bac « Non classé ». Les
 * explorateurs l'étendent au besoin (ex. `modeleId` côté parc).
 */
export interface CatalogueDrillCat extends TreeNode {
  site_id: string | null
  description: string | null
  miniature_id: string | null
  ordre: number
  virtual: boolean
}

interface UseCatalogueDrillParams<TItem, TCat extends CatalogueDrillCat> {
  /** Catégories RÉELLES déjà projetées (commun + site) — le bac virtuel est ajouté ici. */
  realCats: TCat[]
  /**
   * Fabrique le nœud « Non classé » (id `NON_CLASSE_ID`, `virtual: true`) avec les
   * champs propres à l'explorateur.
   */
  makeVirtual: () => TCat
  /** Éléments feuilles du site (gammes, équipements…). */
  items: TItem[]
  getItemId: (item: TItem) => string
  getItemNom: (item: TItem) => string
  getCategorieId: (item: TItem) => string | null
  /** Lecture de l'URL et navigation (`useGammesDrillRoute()` / `useEquipementsDrillRoute()`). */
  route: DrillRoute
}

export interface CatalogueDrill<TItem, TCat> {
  /** Catégories du drill = réelles + bac « Non classé » (si des orphelins existent). */
  drillCats: TCat[]
  /** Chemin résolu (racine → courant). */
  path: TCat[]
  /** Dernière catégorie du chemin, ou `null` à la racine. */
  current: TCat | null
  /** Profondeur (0 = racine). */
  depth: number
  /** Sous-catégories du palier courant, triées (le bac « Non classé » finit dernier). */
  childCategories: TCat[]
  /** Navigue vers un PRÉFIXE de chemin (PUSH). */
  goTo: (chain: TCat[]) => void
  /** Éléments « de racine » (sans catégorie visible), regroupés dans « Non classé ». */
  orphans: TItem[]
  /** Vrai si l'élément est orphelin (racine → bac « Non classé »). */
  isRoot: (item: TItem) => boolean
  /**
   * Éléments d'un palier : bac « Non classé » → orphelins ; `null` → aucun ; sinon
   * ceux qui référencent la catégorie. Source unique du regroupement.
   */
  itemsUnder: (catId: string | null) => TItem[]
  /** Éléments du palier courant (uniquement dans une catégorie), triés par nom. */
  itemsInCurrent: TItem[]
  /** Élément OUVERT (vue détail, niveau FEUILLE) résolu depuis l'URL, ou `null`. */
  openItem: TItem | null
  /** Chaîne de catégories (racine → cat) d'un id réel, indépendante du palier courant. */
  catChain: (catId: string | null) => TCat[]
  /** Navigue vers la fiche détail d'un élément (par son CHEMIN RÉEL). PUSH par défaut. */
  goToItem: (item: TItem, opts?: { replace?: boolean }) => void
}

/**
 * Socle COMMUN des explorateurs de catalogue par catégorie (Plan de maintenance,
 * Équipements) : bac virtuel « Non classé » + orphelins, descente `useTreeDrill`
 * (sur la route fournie par l'hôte), regroupement des éléments par catégorie,
 * résolution de la feuille ouverte, `catChain`, `goToItem` et re-synchronisation
 * de l'URL au renommage. Chaque explorateur ne garde que ses cartes, badges et
 * split spécifiques.
 *
 * Les fonctions d'accès (`getItemId`/`getItemNom`/`getCategorieId`/`makeVirtual`)
 * doivent garder leur identité d'un rendu à l'autre (fonctions de module, ou
 * mémoïsées par React Compiler chez l'hôte) : elles conditionnent les calculs
 * internes (bac « Non classé », drill, tri).
 */
export function useCatalogueDrill<TItem, TCat extends CatalogueDrillCat>({
  realCats,
  makeVirtual,
  items,
  getItemId,
  getItemNom,
  getCategorieId,
  route,
}: UseCatalogueDrillParams<TItem, TCat>): CatalogueDrill<TItem, TCat> {
  // Élément « de racine » : sans catégorie OU rangé dans une catégorie non visible
  // ici → regroupé dans le bac « Non classé ».
  const visibleCatIds = new Set(realCats.map((c) => c.id))
  const isRoot = (item: TItem) => {
    const cid = getCategorieId(item)
    return cid === null || !visibleCatIds.has(cid)
  }
  const orphans = items.filter(isRoot)

  // Catégories du drill = catégories projetées + bac « Non classé » (s'il y a des
  // orphelins uniquement → dataset propre).
  const drillCats: TCat[] =
    orphans.length > 0 ? [...realCats, makeVirtual()] : realCats

  const { path, current, depth, children, goTo, leafSeg, goToLeaf } =
    useTreeDrill(drillCats, route.catSegs, route.navigateTo)

  const childCategories = [...children].sort(
    (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom),
  )

  // Segment d'URL d'un élément, désambiguïsé entre frères (même palier).
  const itemSeg = (item: TItem, siblings: TItem[]) =>
    segOfUnique(
      { id: getItemId(item), nom: getItemNom(item) },
      siblings.map((s) => ({ id: getItemId(s), nom: getItemNom(s) })),
    )

  const itemsUnder = (catId: string | null) =>
    catId === NON_CLASSE_ID
      ? orphans
      : catId === null
        ? []
        : items.filter((it) => getCategorieId(it) === catId)

  const itemsInCurrent =
    current === null
      ? []
      : [...itemsUnder(current.id)].sort((a, b) =>
          // `numeric: true` = tri NATUREL : les segments numériques sont
          // comparés par valeur (« 5 » < « 5.1 » < « 6 » < « 10 »), pas
          // caractère par caractère (qui placerait « 10 » avant « 2 »).
          getItemNom(a).localeCompare(getItemNom(b), undefined, {
            numeric: true,
          }),
        )

  // Élément OUVERT résolu parmi les éléments du palier courant (mêmes frères qu'à
  // la génération → slug stable).
  const openItem = (() => {
    if (leafSeg === undefined || current === null) return null
    const siblings = itemsUnder(current.id)
    return siblings.find((it) => itemSeg(it, siblings) === leafSeg) ?? null
  })()

  const catChain = (catId: string | null): TCat[] => {
    const chain: TCat[] = []
    let id = catId
    while (id) {
      const c = drillCats.find((x) => x.id === id)
      if (!c) break
      chain.unshift(c)
      id = c.parent_id
    }
    return chain
  }

  const goToItem = (item: TItem, opts?: { replace?: boolean }) => {
    // Orphelin → bac « Non classé » ; sinon le chemin réel de sa catégorie.
    const orphan = isRoot(item)
    const cid = getCategorieId(item)
    const chain = orphan ? catChain(NON_CLASSE_ID) : catChain(cid)
    const siblings = itemsUnder(orphan ? NON_CLASSE_ID : cid)
    goToLeaf(chain, itemSeg(item, siblings), { replace: opts?.replace })
  }

  // Re-synchronise l'URL si l'élément OUVERT est renommé (« Modifier » ou réception
  // realtime) : implémentation UNIQUE partagée (`useLeafResync`). `layout: true` →
  // `useLayoutEffect` (resynchro AVANT peinture) car l'élément ouvert occupe tout
  // l'écran : sans ça, flash de la liste (openItem transitoirement null) le temps
  // que le slug frais remplace l'ancien.
  useLeafResync({ leafSeg, openItem, items, getItemId, goToItem, layout: true })

  return {
    drillCats,
    path,
    current,
    depth,
    childCategories,
    goTo,
    orphans,
    isRoot,
    itemsUnder,
    itemsInCurrent,
    openItem,
    catChain,
    goToItem,
  }
}
