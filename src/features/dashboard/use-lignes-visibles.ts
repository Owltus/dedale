import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'

/**
 * Hauteur RÉELLE (clientHeight) d'un élément, suivie en continu par un
 * `ResizeObserver`. Relevé initial SYNCHRONE avant le paint (pas de flash), maj de
 * l'état SEULEMENT si la valeur change (pas de boucle de rendu). `0` tant que le 1er
 * layout n'a pas eu lieu. Mutualisé par le tableau de bord pour mesurer la place
 * disponible d'une carte et la hauteur de son en-tête variable.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
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

  return hauteur
}

/**
 * Combien de lignes de liste ENTIÈRES tiennent dans la place disponible d'une carte
 * du tableau de bord (Demandes, Documents), pour que la carte se dimensionne à SON
 * CONTENU (en-tête + N lignes) sans jamais déborder ni afficher de scrollbar :
 *
 *   dispo    = hauteurCase − chrome   (chrome = en-tête + marges internes de la carte)
 *   nbLignes = floor( (dispo + gap) / (hauteurLigne + gap) )
 *
 * `ref` mesure la CASE pleine hauteur (place réservée à la carte). Le `chrome` retire
 * la part non-liste (en-tête, paddings, et alerte éventuelle mesurée par l'appelant) :
 * ainsi N est le nombre de lignes qui tiennent VRAIMENT sous l'en-tête. Un résultat
 * volontairement PRUDENT (floor) → jamais de demi-ligne rognée ; on préfère laisser un
 * peu de vide en bas plutôt que couper une ligne.
 *
 * Repli : hauteur pas encore mesurée (0) → `fallback` lignes, le temps que la mesure
 * converge (la case est en `overflow-hidden`, donc aucun débordement transitoire).
 */
export function useLignesVisibles(
  ref: RefObject<HTMLElement | null>,
  hauteurLigne: number,
  {
    gap = 8,
    chrome = 0,
    fallback = 6,
  }: { gap?: number; chrome?: number; fallback?: number } = {},
): number {
  const hauteur = useElementHeight(ref)

  return useMemo(() => {
    if (hauteur <= 0) return fallback
    const dispo = hauteur - chrome
    const n = Math.floor((dispo + gap) / (hauteurLigne + gap))
    return Math.max(0, n)
  }, [hauteur, hauteurLigne, gap, chrome, fallback])
}
