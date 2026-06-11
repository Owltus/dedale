import { useCallback, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { segOfUnique } from '@/lib/slug'

// API typée de la route SPLAT porteuse du chemin lisible
// (`/bibliotheque/<onglet>/<élément>`, segments slugifiés). Via `getRouteApi`
// (et non un import du module de route) pour ne PAS inverser la dépendance
// features → routes : la route reste la seule à connaître la feature.
const route = getRouteApi('/_app/bibliotheque/$')

/**
 * Navigation à UN niveau portée par le CHEMIN d'URL, pour un onglet de la
 * Bibliothèque : soit la liste (racine), soit un élément ouvert (détail), sous
 * `/bibliotheque/<onglet>/<élément slugifié>` — plus de state ni de search
 * param. Calque le patron de l'onglet Gammes pour les onglets à descente simple
 * (Modèles d'équipements : catégorie → modèles ; Modèles d'opérations :
 * modèle → opérations) : retour navigateur pas-à-pas, liens partageables, et
 * re-clic de l'onglet = retour à la racine (géré par la route).
 *
 * `items` = TOUS les éléments ouvrables, NON filtrés par périmètre, pour que le
 * segment se résolve quel que soit le filtre courant (Commun / site / Tout).
 * `segOfUnique` les désambiguïse entre frères, avec le MÊME ensemble en
 * génération (`open`) et en résolution (`selected`) → symétrie garantie : un
 * segment se relit toujours à l'identique. Donnez un `items` mémoïsé (référence
 * stable) pour éviter de recalculer la résolution à chaque rendu.
 */
export function useBiblioDrill<T extends { id: string; nom: string }>(
  onglet: string,
  items: T[],
): {
  /** Élément ouvert (résolu depuis l'URL), ou `null` à la racine / lien cassé. */
  selected: T | null
  /** Ouvre un élément (PUSH : entrée d'historique). */
  open: (item: T) => void
  /** Revient à la racine de l'onglet. */
  back: () => void
} {
  const { _splat } = route.useParams()
  const navigate = route.useNavigate()
  // segments[0] = l'onglet (résolu par la route) ; segments[1] = l'élément ouvert.
  const seg = (_splat ?? '').split('/').filter(Boolean)[1]

  const selected = useMemo(
    () =>
      seg === undefined
        ? null
        : (items.find((it) => segOfUnique(it, items) === seg) ?? null),
    [seg, items],
  )

  const open = useCallback(
    (item: T) => {
      void navigate({
        to: '/bibliotheque/$',
        params: { _splat: `${onglet}/${segOfUnique(item, items)}` },
      })
    },
    [navigate, onglet, items],
  )

  const back = useCallback(() => {
    void navigate({ to: '/bibliotheque/$', params: { _splat: onglet } })
  }, [navigate, onglet])

  return { selected, open, back }
}
