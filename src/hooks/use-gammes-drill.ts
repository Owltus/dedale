import { useCallback, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTreeDrill, type TreeDrill, type TreeNode } from './use-tree-drill'

// API typée de la route SPLAT `/gammes/<cat>/<sous>/<gamme>`. Via `getRouteApi`
// pour ne PAS inverser la dépendance features → routes.
const route = getRouteApi('/_app/gammes/$')

/**
 * Descente par CATÉGORIES de la page Plan de maintenance, portée par le CHEMIN
 * d'URL : `/gammes/<cat>/<sous>/<gamme>`. Même patron que la page Équipements
 * (`useEquipementsDrill`) : tous les segments du `_splat` composent le chemin de
 * catégories, la FEUILLE éventuelle (une gamme ouverte) étant résolue par
 * l'explorateur. Mince adaptateur de route : toute la logique vit dans
 * `useTreeDrill`.
 *
 * `cats` = TOUTES les catégories de gamme ouvrables (commun + site), NON filtrées
 * davantage, pour que le chemin se résolve de bout en bout.
 */
export function useGammesDrill<T extends TreeNode>(cats: T[]): TreeDrill<T> {
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  const catSegs = useMemo(
    () => (_splat ?? '').split('/').filter(Boolean),
    [_splat],
  )
  const navigateTo = useCallback(
    (segs: string[], leaf: string | undefined, opts: { replace: boolean }) => {
      void navigate({
        to: '/gammes/$',
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
