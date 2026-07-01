import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'

/**
 * Combien de lignes de liste tiennent dans la hauteur RÉELLE d'un conteneur
 * (mesurée en continu par un `ResizeObserver`), pour que les colonnes du tableau
 * de bord (Demandes, Documents) ne débordent jamais ni n'affichent de scrollbar :
 *
 *   nbLignes = floor( (hauteurUtile + gap) / (hauteurLigne + gap) )
 *
 * Même esprit que `useColonnesAuto` (planning) : relevé initial SYNCHRONE avant le
 * paint (pas de flash), notifications du `ResizeObserver` passées par un
 * `requestAnimationFrame`, état mis à jour SEULEMENT si la hauteur a changé (pas de
 * boucle de rendu). Le conteneur observé doit être en `overflow-hidden` : la
 * dernière ligne partielle est rognée proprement.
 *
 * Repli : hauteur non encore connue (0, avant le 1er layout) → `fallback` lignes.
 * Le conteneur croît alors jusqu'à `fallback` lignes puis la mesure converge.
 */
export function useLignesVisibles(
  ref: RefObject<HTMLElement | null>,
  hauteurLigne: number,
  {
    gap = 8,
    min = 1,
    fallback = 6,
  }: { gap?: number; min?: number; fallback?: number } = {},
): number {
  const [hauteur, setHauteur] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const relever = () =>
      setHauteur((prev) => (prev === el.clientHeight ? prev : el.clientHeight))
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
  }, [ref])

  return useMemo(() => {
    if (hauteur <= 0) return fallback
    const n = Math.floor((hauteur + gap) / (hauteurLigne + gap))
    return Math.max(min, n)
  }, [hauteur, hauteurLigne, gap, min, fallback])
}
