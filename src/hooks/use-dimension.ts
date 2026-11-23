import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Dimension RÉELLE (`clientWidth` ou `clientHeight`) d'un élément, suivie en
 * continu par un `ResizeObserver`. Moteur commun des mesures de frises, graphes,
 * planning et cartes du tableau de bord.
 *
 * - Relevé initial SYNCHRONE dans un `useLayoutEffect` (avant le paint → pas de
 *   flash). `0` tant que l'élément n'est pas monté.
 * - Les notifications passent par un `requestAnimationFrame`, et l'état n'est mis
 *   à jour QUE si la valeur change → pas de boucle de rendu au redimensionnement.
 *
 * `cible` : une ref (lue dans l'effet, après le commit) ou directement l'élément.
 * `parent` : mesure et observe le PARENT de l'élément au lieu de l'élément.
 * `actif` : relance la mesure quand il change — à passer à `false` tant que
 * l'élément n'est pas encore monté (sinon la mesure, faite sur une ref nulle, ne
 * reprend jamais).
 */
export function useDimension(
  cible: RefObject<HTMLElement | null> | HTMLElement | null,
  dimension: 'clientWidth' | 'clientHeight',
  { parent = false, actif = true }: { parent?: boolean; actif?: boolean } = {},
): number {
  const [valeur, setValeur] = useState(0)

  useLayoutEffect(() => {
    const base = cible && 'current' in cible ? cible.current : cible
    const el = parent ? base?.parentElement : base
    if (!el) return
    let raf = 0
    const relever = () =>
      setValeur((prev) => (prev === el[dimension] ? prev : el[dimension]))
    relever()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(relever)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [cible, dimension, parent, actif])

  return valeur
}
