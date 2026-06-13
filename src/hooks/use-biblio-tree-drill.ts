import { useCallback, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { segOfUnique } from '@/lib/slug'

// API typée de la route SPLAT (`/bibliotheque/<onglet>/<cat>/<sous>/…`). Via
// `getRouteApi` pour ne PAS inverser la dépendance features → routes.
const route = getRouteApi('/_app/bibliotheque/$')

/** Nœud d'arbre minimal : un id, un nom (pour le slug), un parent. */
interface TreeNode {
  id: string
  nom: string
  parent_id: string | null
}

/**
 * Descente MULTI-NIVEAUX d'un arbre de catégories portée par le CHEMIN d'URL,
 * pour un onglet de la Bibliothèque : `/bibliotheque/<onglet>/<cat>/<sous>/…`,
 * chaque segment = le nom slugifié de la catégorie, désambiguïsé entre frères
 * (`segOfUnique`). Généralise le patron de l'onglet « Plan de maintenance »
 * (catégorie → sous-catégorie) à une profondeur quelconque, partageable par tout
 * onglet à arbre de catégories (Modèles d'équipements…). Les FEUILLES (gamme,
 * modèle) restent l'affaire du panneau : ce hook ne porte QUE le chemin de
 * catégories. Pour une descente à UN seul niveau, voir `useBiblioDrill`.
 *
 * `cats` = TOUTES les catégories ouvrables (NON filtrées par périmètre) pour que
 * le chemin se résolve quel que soit le filtre courant (Commun / site / Tout).
 *
 * RÉSOLUTION TOLÉRANTE : un segment introuvable (lien cassé, renommage, masquage
 * realtime) TRONQUE le chemin à son préfixe valide → on remonte proprement au
 * dernier palier résolu, sans éjection brutale vers la racine. Symétrie
 * génération/résolution via `segOfUnique` sur les MÊMES frères (les enfants du
 * même parent), de chaque côté.
 */
export function useBiblioTreeDrill<T extends TreeNode>(
  onglet: string,
  cats: T[],
): {
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
   * modèle…), ou `undefined`. À résoudre par le panneau contre ses propres
   * éléments. La résolution gloutonne s'arrête au 1er segment qui ne matche aucune
   * catégorie → ce segment est la feuille.
   */
  leafSeg: string | undefined
  /**
   * Navigue vers un chemin + une FEUILLE : `<onglet>/<cats…>/<leaf>`. PUSH par
   * défaut ; `replace` pour re-synchroniser l'URL sans entrée d'historique (ex.
   * feuille renommée).
   */
  goToLeaf: (chain: T[], leaf: string, opts?: { replace?: boolean }) => void
} {
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  // segments[0] = l'onglet (résolu par la route) ; les suivants = le chemin de cat.
  const catSegs = useMemo(
    () => (_splat ?? '').split('/').filter(Boolean).slice(1),
    [_splat],
  )

  // Résolution gloutonne : à chaque palier, on cherche parmi les FRÈRES (enfants
  // du parent courant) celui dont `segOfUnique` vaut le segment. Introuvable →
  // on s'arrête (troncature au préfixe valide). Mêmes ensembles de frères qu'à la
  // génération (`buildSplat`) → un segment se relit toujours à l'identique.
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
  // Premier segment au-delà du chemin résolu = la FEUILLE (le panneau la résout
  // contre ses propres éléments). `undefined` si le chemin consomme tout.
  const leafSeg = catSegs[path.length]

  const children = useMemo(
    () => cats.filter((c) => c.parent_id === (current?.id ?? null)),
    [cats, current],
  )

  // Construit le chemin splat (slugs des noms, désambiguïsés entre frères) :
  // préfixe `onglet`, puis chaque catégorie sur SES frères (`parent_id` identique),
  // puis éventuellement le segment de feuille (déjà slugifié par l'appelant).
  const buildSplat = useCallback(
    (chain: T[], leaf?: string) =>
      [
        onglet,
        ...chain.map((c) =>
          segOfUnique(
            c,
            cats.filter((x) => x.parent_id === c.parent_id),
          ),
        ),
        ...(leaf !== undefined ? [leaf] : []),
      ].join('/'),
    [onglet, cats],
  )

  const goTo = useCallback(
    (chain: T[]) => {
      void navigate({
        to: '/bibliotheque/$',
        params: { _splat: buildSplat(chain) },
      })
    },
    [navigate, buildSplat],
  )

  const goToLeaf = useCallback(
    (chain: T[], leaf: string, opts?: { replace?: boolean }) => {
      void navigate({
        to: '/bibliotheque/$',
        params: { _splat: buildSplat(chain, leaf) },
        replace: opts?.replace ?? false,
      })
    },
    [navigate, buildSplat],
  )

  return {
    path,
    current,
    depth: path.length,
    children,
    goTo,
    leafSeg,
    goToLeaf,
  }
}
