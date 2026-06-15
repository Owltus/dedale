import { useCallback, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTreeDrill, type TreeDrill, type TreeNode } from './use-tree-drill'

// API typée de la route SPLAT `/equipements/<cat>/<sous>/<équipement>`. Via
// `getRouteApi` pour ne PAS inverser la dépendance features → routes.
const route = getRouteApi('/_app/equipements/$')

/**
 * Descente par CATÉGORIES de la page Équipements, portée par le CHEMIN d'URL :
 * `/equipements/<cat>/<sous>/<équipement>`. Même patron que la Bibliothèque
 * (`useBiblioTreeDrill`) mais SANS préfixe d'onglet : tous les segments du
 * `_splat` composent le chemin de catégories, la FEUILLE éventuelle (un équipement
 * ouvert) étant résolue par le panneau. Mince adaptateur de route : toute la
 * logique vit dans `useTreeDrill`.
 *
 * `cats` = TOUTES les catégories d'équipement ouvrables du site (commun + site),
 * NON filtrées davantage, pour que le chemin se résolve de bout en bout.
 */
export function useEquipementsDrill<T extends TreeNode>(
  cats: T[],
): TreeDrill<T> {
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  const catSegs = useMemo(
    () => (_splat ?? '').split('/').filter(Boolean),
    [_splat],
  )
  const navigateTo = useCallback(
    (segs: string[], leaf: string | undefined, opts: { replace: boolean }) => {
      void navigate({
        to: '/equipements/$',
        params: {
          _splat: [...segs, ...(leaf !== undefined ? [leaf] : [])].join('/'),
        },
        replace: opts.replace,
      })
    },
    [navigate],
  )
  return useTreeDrill(cats, catSegs, navigateTo)
}
