import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'

/**
 * Largeur FIXE d'une colonne-semaine (px). Ne change JAMAIS : c'est le NOMBRE de
 * colonnes qui s'adapte à l'écran, pas leur largeur → des cases carrées régulières,
 * alignées au pixel (aspect « grille dense »).
 */
export const CELL_SIZE = 24
/** Largeur MINIMALE de la colonne de gauche (sous-catégories) ; elle est élastique
 *  et absorbe les pixels restants après calcul des colonnes entières. */
export const FAMILLE_MIN = 160
/** Bornes du nombre de semaines : utilisable sur petit écran ↔ ~3 ans sur très grand. */
const MIN_SEMAINES = 10
const MAX_SEMAINES = 156

/**
 * À partir de la largeur RÉELLE d'un conteneur (mesurée en continu par un
 * `ResizeObserver`), calcule combien de colonnes-semaines de largeur fixe
 * (`CELL_SIZE`) tiennent, et la largeur élastique de la colonne de gauche :
 *
 *   utile         = floor(clientWidth)   // hors bordure ET hors scrollbar verticale
 *   colonnes      = clamp( floor((utile − FAMILLE_MIN) / CELL_SIZE), MIN, MAX )
 *   largeurGauche = max( FAMILLE_MIN, utile − colonnes × CELL_SIZE )
 *
 * Le `floor` garantit des colonnes ENTIÈRES alignées au pixel (pas de bord flou), et
 * la colonne de gauche récupère les quelques pixels en trop.
 *
 * Mesure : `useLayoutEffect` + relevé initial SYNCHRONE (avant le paint) → pas de
 * flash à `MIN_SEMAINES` au montage. Les notifications du `ResizeObserver` passent
 * par un `requestAnimationFrame` et l'état n'est mis à jour QUE si la largeur a
 * changé → pas de boucle de rendu pendant un redimensionnement.
 *
 * NB : le conteneur observé ne doit pas porter de PADDING horizontal (`clientWidth`
 * l'inclut, ce qui fausserait la largeur utile de la table).
 */
export function useColonnesAuto(ref: RefObject<HTMLElement | null>): {
  nbSemaines: number
  familleWidth: number
} {
  const [largeur, setLargeur] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    // `clientWidth` = largeur INTÉRIEURE (hors bordure ET hors barre de défilement
    // verticale) → exactement la place disponible pour la table. Relevé initial
    // synchrone (avant le paint) : pas de saut 10 → N colonnes.
    const relever = () =>
      setLargeur((prev) => (prev === el.clientWidth ? prev : el.clientWidth))
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
    const utile = Math.floor(largeur)
    if (utile <= FAMILLE_MIN)
      return { nbSemaines: MIN_SEMAINES, familleWidth: FAMILLE_MIN }
    const nbSemaines = Math.min(
      MAX_SEMAINES,
      Math.max(MIN_SEMAINES, Math.floor((utile - FAMILLE_MIN) / CELL_SIZE)),
    )
    const familleWidth = Math.max(FAMILLE_MIN, utile - nbSemaines * CELL_SIZE)
    return { nbSemaines, familleWidth }
  }, [largeur])
}
