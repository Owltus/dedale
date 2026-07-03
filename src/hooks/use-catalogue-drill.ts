import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { segOfUnique } from '@/lib/slug'
import type { TreeDrill, TreeNode } from './use-tree-drill'

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
   * champs propres à l'explorateur. À mémoïser (`useCallback`) pour la stabilité.
   */
  makeVirtual: () => TCat
  /** Éléments feuilles du site (gammes, équipements…). */
  items: TItem[]
  getItemId: (item: TItem) => string
  getItemNom: (item: TItem) => string
  getCategorieId: (item: TItem) => string | null
  /** Adaptateur de route (`useGammesDrill` / `useEquipementsDrill`) enveloppant `useTreeDrill`. */
  useDrill: (cats: TCat[]) => TreeDrill<TCat>
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
 * (via l'adaptateur de route fourni), regroupement des éléments par catégorie,
 * résolution de la feuille ouverte, `catChain`, `goToItem` et re-synchronisation
 * de l'URL au renommage. Chaque explorateur ne garde que ses cartes, badges et
 * split spécifiques.
 *
 * Les fonctions d'accès (`getItemId`/`getItemNom`/`getCategorieId`/`makeVirtual`)
 * DOIVENT être mémoïsées côté hôte : elles alimentent les dépendances des `useMemo`
 * internes (bac « Non classé », drill, tri).
 */
export function useCatalogueDrill<TItem, TCat extends CatalogueDrillCat>({
  realCats,
  makeVirtual,
  items,
  getItemId,
  getItemNom,
  getCategorieId,
  useDrill,
}: UseCatalogueDrillParams<TItem, TCat>): CatalogueDrill<TItem, TCat> {
  // Élément « de racine » : sans catégorie OU rangé dans une catégorie non visible
  // ici → regroupé dans le bac « Non classé ».
  const visibleCatIds = useMemo(
    () => new Set(realCats.map((c) => c.id)),
    [realCats],
  )
  const isRoot = useCallback(
    (item: TItem) => {
      const cid = getCategorieId(item)
      return cid === null || !visibleCatIds.has(cid)
    },
    [visibleCatIds, getCategorieId],
  )
  const orphans = useMemo(() => items.filter(isRoot), [items, isRoot])

  // Catégories du drill = catégories projetées + bac « Non classé » (s'il y a des
  // orphelins uniquement → dataset propre).
  const drillCats = useMemo<TCat[]>(
    () => (orphans.length > 0 ? [...realCats, makeVirtual()] : realCats),
    [realCats, orphans, makeVirtual],
  )

  const { path, current, depth, children, goTo, leafSeg, goToLeaf } =
    useDrill(drillCats)

  const childCategories = useMemo(
    () =>
      [...children].sort(
        (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom),
      ),
    [children],
  )

  // Segment d'URL d'un élément, désambiguïsé entre frères (même palier).
  const itemSeg = useCallback(
    (item: TItem, siblings: TItem[]) =>
      segOfUnique(
        { id: getItemId(item), nom: getItemNom(item) },
        siblings.map((s) => ({ id: getItemId(s), nom: getItemNom(s) })),
      ),
    [getItemId, getItemNom],
  )

  const itemsUnder = useCallback(
    (catId: string | null) =>
      catId === NON_CLASSE_ID
        ? orphans
        : catId === null
          ? []
          : items.filter((it) => getCategorieId(it) === catId),
    [items, orphans, getCategorieId],
  )

  const itemsInCurrent = useMemo(
    () =>
      current === null
        ? []
        : [...itemsUnder(current.id)].sort((a, b) =>
            getItemNom(a).localeCompare(getItemNom(b)),
          ),
    [itemsUnder, current, getItemNom],
  )

  // Élément OUVERT résolu parmi les éléments du palier courant (mêmes frères qu'à
  // la génération → slug stable).
  const openItem = useMemo(() => {
    if (leafSeg === undefined || current === null) return null
    const siblings = itemsUnder(current.id)
    return siblings.find((it) => itemSeg(it, siblings) === leafSeg) ?? null
  }, [leafSeg, current, itemsUnder, itemSeg])

  const catChain = useCallback(
    (catId: string | null): TCat[] => {
      const chain: TCat[] = []
      let id = catId
      while (id) {
        const c = drillCats.find((x) => x.id === id)
        if (!c) break
        chain.unshift(c)
        id = c.parent_id
      }
      return chain
    },
    [drillCats],
  )

  const goToItem = useCallback(
    (item: TItem, opts?: { replace?: boolean }) => {
      // Orphelin → bac « Non classé » ; sinon le chemin réel de sa catégorie.
      const orphan = isRoot(item)
      const cid = getCategorieId(item)
      const chain = orphan ? catChain(NON_CLASSE_ID) : catChain(cid)
      const siblings = itemsUnder(orphan ? NON_CLASSE_ID : cid)
      goToLeaf(chain, itemSeg(item, siblings), { replace: opts?.replace })
    },
    [isRoot, getCategorieId, catChain, itemsUnder, itemSeg, goToLeaf],
  )

  // Re-synchronise l'URL si l'élément OUVERT est renommé (« Modifier » ou réception
  // realtime) : son slug change → l'URL ne le résout plus. On mémorise id + segment
  // et, s'il existe encore, on réécrit l'URL sur son chemin frais (REPLACE) sans
  // fermer le détail ; supprimé → repli propre vers la navigation.
  //
  // `useLayoutEffect` (et non le hook `useLeafResync`, qui est en `useEffect`) : la
  // resynchro doit se faire AVANT la peinture, sinon on voit un flash de la liste
  // (openItem transitoirement null) le temps que le slug frais remplace l'ancien.
  const lastIdRef = useRef<string | null>(null)
  const lastLeafRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (openItem !== null) {
      lastIdRef.current = getItemId(openItem)
      lastLeafRef.current = leafSeg
    }
  }, [openItem, leafSeg, getItemId])
  useLayoutEffect(() => {
    if (leafSeg === undefined || openItem !== null) return
    if (leafSeg !== lastLeafRef.current) return
    const id = lastIdRef.current
    if (id === null) return
    const fresh = items.find((it) => getItemId(it) === id)
    if (!fresh) return
    goToItem(fresh, { replace: true })
  }, [leafSeg, openItem, items, goToItem, getItemId])

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
