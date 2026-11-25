import { getRouteApi } from '@tanstack/react-router'
import type { DrillRoute } from '@/hooks/use-tree-drill'
import { joinSplat, splatCatSegs } from '@/hooks/drill-splat'

// API typée de la route SPLAT `/gammes/<cat>/<sous>/<gamme>`. Via `getRouteApi`
// pour ne PAS inverser la dépendance features → routes.
const route = getRouteApi('/_app/gammes/$')

/**
 * Descente par CATÉGORIES de la page Plan de maintenance, portée par le CHEMIN
 * d'URL : `/gammes/<cat>/<sous>/<gamme>`. Même patron que la page Équipements
 * (`useEquipementsDrillRoute`) : tous les segments du `_splat` composent le
 * chemin de catégories, la FEUILLE éventuelle (une gamme ouverte) étant résolue
 * par l'explorateur. Mince adaptateur de route : il ne fait que lire l'URL et
 * naviguer, toute la logique vit dans `useTreeDrill` (via `useCatalogueDrill`).
 */
export function useGammesDrillRoute(): DrillRoute {
  // Directive : ce hook n'appelle aucun hook que React Compiler reconnaisse
  // (`route.useX()` ou calcul pur), le compilateur ne l'inférerait donc pas ;
  // on le lui fait compiler pour que ses valeurs gardent leur identité.
  'use memo'
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  const catSegs = splatCatSegs(_splat, false)
  const navigateTo = (
    segs: string[],
    leaf: string | undefined,
    opts: { replace: boolean },
  ) => {
    void navigate({
      to: '/gammes/$',
      params: { _splat: joinSplat([], segs, leaf) },
      replace: opts.replace,
    })
  }
  return { catSegs, navigateTo }
}
