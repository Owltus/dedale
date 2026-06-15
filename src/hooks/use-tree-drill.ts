import { useCallback, useMemo } from 'react'
import { segOfUnique } from '@/lib/slug'

/** Nœud d'arbre minimal : un id, un nom (pour le slug), un parent. */
export interface TreeNode {
  id: string
  nom: string
  parent_id: string | null
}

export interface TreeDrill<T> {
  /** Chemin résolu (racine → courant), tronqué au 1er segment invalide. */
  path: T[]
  /** Dernière catégorie du chemin, ou `null` à la racine. */
  current: T | null
  /** Profondeur = longueur du chemin (0 = racine). */
  depth: number
  /** Enfants directs du palier courant (racines à la racine), NON triés/filtrés. */
  children: T[]
  /** Navigue vers un PRÉFIXE de chemin (PUSH) : `[]` = racine, `[a]`, `[a, b]`… */
  goTo: (chain: T[]) => void
  /**
   * Premier segment NON consommé par le chemin de catégories (la FEUILLE : gamme,
   * modèle, équipement…), ou `undefined`. À résoudre par l'appelant contre ses
   * propres éléments.
   */
  leafSeg: string | undefined
  /** Navigue vers un chemin + une FEUILLE. PUSH par défaut ; `replace` en option. */
  goToLeaf: (chain: T[], leaf: string, opts?: { replace?: boolean }) => void
}

/**
 * Cœur GÉNÉRIQUE (sans route) de la descente multi-niveaux d'un arbre de
 * catégories portée par le chemin d'URL. Les wrappers liés à une route concrète
 * (`useBiblioTreeDrill`, `useEquipementsDrill`) fournissent les segments de
 * catégorie déjà extraits du `_splat` (`catSegs`) et la fonction `navigateTo` qui
 * reconstruit le `_splat` complet (préfixe d'onglet éventuel + segments + feuille)
 * et appelle le routeur.
 *
 * `cats` = TOUTES les catégories ouvrables (NON filtrées par périmètre) pour que
 * le chemin se résolve quel que soit le filtre courant. Résolution gloutonne et
 * TOLÉRANTE : un segment introuvable (lien cassé, renommage, masquage realtime)
 * TRONQUE le chemin à son préfixe valide → on remonte proprement au dernier palier
 * résolu. Symétrie génération/résolution via `segOfUnique` sur les MÊMES frères
 * (enfants du même parent), de chaque côté : un segment se relit à l'identique.
 */
export function useTreeDrill<T extends TreeNode>(
  cats: T[],
  catSegs: string[],
  navigateTo: (
    catSegs: string[],
    leaf: string | undefined,
    opts: { replace: boolean },
  ) => void,
): TreeDrill<T> {
  const path = useMemo<T[]>(() => {
    const result: T[] = []
    let parentId: string | null = null
    for (const seg of catSegs) {
      const siblings = cats.filter((c) => c.parent_id === parentId)
      const match = siblings.find((c) => segOfUnique(c, siblings) === seg)
      if (!match) break
      result.push(match)
      parentId = match.id
    }
    return result
  }, [catSegs, cats])

  const current = path.at(-1) ?? null
  const leafSeg = catSegs[path.length]

  const children = useMemo(
    () => cats.filter((c) => c.parent_id === (current?.id ?? null)),
    [cats, current],
  )

  // Segments de catégorie d'un chemin : slug de chaque catégorie sur SES frères
  // (`parent_id` identique), désambiguïsé (`segOfUnique`).
  const buildCatSegs = useCallback(
    (chain: T[]) =>
      chain.map((c) =>
        segOfUnique(
          c,
          cats.filter((x) => x.parent_id === c.parent_id),
        ),
      ),
    [cats],
  )

  const goTo = useCallback(
    (chain: T[]) =>
      navigateTo(buildCatSegs(chain), undefined, { replace: false }),
    [navigateTo, buildCatSegs],
  )

  const goToLeaf = useCallback(
    (chain: T[], leaf: string, opts?: { replace?: boolean }) =>
      navigateTo(buildCatSegs(chain), leaf, { replace: opts?.replace ?? false }),
    [navigateTo, buildCatSegs],
  )

  return { path, current, depth: path.length, children, goTo, leafSeg, goToLeaf }
}
