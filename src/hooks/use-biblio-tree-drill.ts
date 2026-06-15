import { useCallback, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTreeDrill, type TreeDrill, type TreeNode } from './use-tree-drill'

// API typée de la route SPLAT (`/bibliotheque/<onglet>/<cat>/<sous>/…`). Via
// `getRouteApi` pour ne PAS inverser la dépendance features → routes.
const route = getRouteApi('/_app/bibliotheque/$')

/**
 * Descente MULTI-NIVEAUX d'un arbre de catégories portée par le CHEMIN d'URL,
 * pour un onglet de la Bibliothèque : `/bibliotheque/<onglet>/<cat>/<sous>/…`,
 * chaque segment = le nom slugifié de la catégorie, désambiguïsé entre frères
 * (`segOfUnique`). Le 1er segment du `_splat` est l'onglet (résolu par la route),
 * on ne consomme que les suivants comme chemin de catégories.
 *
 * Mince adaptateur de route : la logique de résolution/navigation vit dans
 * `useTreeDrill`. Pour une descente hors Bibliothèque (page Équipements), voir
 * `useEquipementsDrill`. Pour une descente à UN seul niveau, voir `useBiblioDrill`.
 *
 * `cats` = TOUTES les catégories ouvrables (NON filtrées par périmètre) pour que
 * le chemin se résolve quel que soit le filtre courant (Commun / site / Tout).
 */
export function useBiblioTreeDrill<T extends TreeNode>(
  onglet: string,
  cats: T[],
): TreeDrill<T> {
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  // segments[0] = l'onglet (résolu par la route) ; les suivants = le chemin de cat.
  const catSegs = useMemo(
    () => (_splat ?? '').split('/').filter(Boolean).slice(1),
    [_splat],
  )
  const navigateTo = useCallback(
    (segs: string[], leaf: string | undefined, opts: { replace: boolean }) => {
      void navigate({
        to: '/bibliotheque/$',
        params: {
          _splat: [
            onglet,
            ...segs,
            ...(leaf !== undefined ? [leaf] : []),
          ].join('/'),
        },
        replace: opts.replace,
      })
    },
    [navigate, onglet],
  )
  return useTreeDrill(cats, catSegs, navigateTo)
}
