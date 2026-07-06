import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Géométrie PARTAGÉE des cartes de liste du tableau de bord (Demandes, Documents).
// SOURCE UNIQUE consommée à la fois par le fit-to-height (les cartes) ET par la
// bascule fill-or-scroll (`dashboard.tsx`) : ces deux calculs DOIVENT rester sur la
// même géométrie, sinon ils divergent en silence. Chaque valeur reflète une classe
// Tailwind posée ailleurs — indiquée en commentaire.
// ─────────────────────────────────────────────────────────────────────────────

/** Hauteur d'une `ListRow` média densité `xs` (`h-11`). */
export const HAUTEUR_LIGNE_XS = 44
/** Espace inter-lignes de `listStack` (`gap-2`). */
export const GAP_LISTE = 8
/** Part NON-liste d'une carte (padding `py-3` = 12 + 12). */
export const CHROME_CARTE = 24

/**
 * Hauteur RÉELLE (clientHeight) d'un élément, suivie en continu par un
 * `ResizeObserver`. Relevé initial SYNCHRONE avant le paint (pas de flash), maj de
 * l'état SEULEMENT si la valeur change (pas de boucle de rendu). `0` tant que le 1er
 * layout n'a pas eu lieu.
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
 * Comme {@link useElementHeight}, mais mesure le PARENT de l'élément référencé (le
 * corps de page défilant). Stable même quand le tableau grandit : le parent est le
 * conteneur de défilement, sa `clientHeight` reste la fenêtre visible → base FIXE pour
 * décider la bascule fill-or-scroll, indépendamment du plancher appliqué aux cartes.
 */
export function useParentClientHeight(
  ref: RefObject<HTMLElement | null>,
): number {
  const [hauteur, setHauteur] = useState(0)

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    let raf = 0
    const relever = () =>
      setHauteur((prev) =>
        prev === parent.clientHeight ? prev : parent.clientHeight,
      )
    relever()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(relever)
    })
    ro.observe(parent)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [ref])

  return hauteur
}

/**
 * Combien de lignes de liste ENTIÈRES tiennent dans la hauteur d'un conteneur (`ref`
 * mesuré en continu), pour n'afficher que ce qui rentre :
 *
 *   nbLignes = floor( (hauteur + gap) / (hauteurLigne + gap) )
 *
 * Résultat PRUDENT (floor) → jamais de demi-ligne rognée. Repli : hauteur pas encore
 * mesurée (0) → `fallback` lignes, le temps que la mesure converge.
 */
export function useLignesVisibles(
  ref: RefObject<HTMLElement | null>,
  hauteurLigne: number,
  { gap = GAP_LISTE, fallback = 6 }: { gap?: number; fallback?: number } = {},
): number {
  const hauteur = useElementHeight(ref)

  return useMemo(() => {
    if (hauteur <= 0) return fallback
    const n = Math.floor((hauteur + gap) / (hauteurLigne + gap))
    return Math.max(0, n)
  }, [hauteur, hauteurLigne, gap, fallback])
}
