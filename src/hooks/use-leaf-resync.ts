import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

interface UseLeafResyncOptions<T> {
  /** Segment de FEUILLE de l'URL (undefined = pas de détail ouvert). */
  leafSeg: string | undefined
  /** Élément résolu depuis `leafSeg` (null = segment irrésolu ou pas de feuille). */
  openItem: T | null
  /** Liste fraîche où retrouver l'élément par id (renommé → slug changé). */
  items: readonly T[]
  /** Accès à l'identifiant stable d'un élément (les items n'ont pas tous `.id` en propre). */
  getItemId: (item: T) => string
  /**
   * Réécrit l'URL sur le chemin frais de l'élément — typiquement le `goToX`
   * (mémoïsé `useCallback`) du panneau, appelé avec `{ replace: true }`.
   */
  goToItem: (item: T, opts: { replace: boolean }) => void
  /**
   * Timing de la resynchro. `false` (défaut) = `useEffect` (le flash transitoire de
   * la liste est toléré). `true` = `useLayoutEffect` (resynchro AVANT peinture, pas
   * de flash) — pour les explorateurs de catalogue où l'élément ouvert occupe tout
   * l'écran. Constant pour un point d'appel donné.
   */
  layout?: boolean
}

/**
 * Re-synchronise l'URL quand l'élément OUVERT (feuille d'un drill) est renommé
 * ou déplacé (« Modifier » ou réception realtime) : son slug change → l'URL ne
 * le résout plus (`openItem` devient null). On mémorise id + segment et, si
 * l'élément existe encore, on réécrit l'URL sur son chemin frais (REPLACE)
 * sans fermer le détail ; supprimé → repli propre vers la navigation.
 *
 * Garde-fou : on ne re-synchronise que le MÊME segment devenu irrésolu (élément
 * renommé sous une URL stable), pas une navigation vers une autre URL périmée
 * (back/forward).
 *
 * Implémentation UNIQUE, partagée par les panneaux Bibliothèque (`useEffect`) et
 * par `useCatalogueDrill` (`layout: true` → `useLayoutEffect`, anti-flash). Les
 * DEUX effets sont toujours déclarés (règles des hooks) mais un seul agit, gardé
 * par `layout` (constant).
 *
 * Usage :
 * ```tsx
 * useLeafResync({ leafSeg, openItem: openModele, items: modeles,
 *   getItemId: (m) => m.id, goToItem: goToModele })
 * ```
 */
export function useLeafResync<T>({
  leafSeg,
  openItem,
  items,
  getItemId,
  goToItem,
  layout = false,
}: UseLeafResyncOptions<T>): void {
  const lastIdRef = useRef<string | null>(null)
  const lastSegRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (openItem !== null) {
      lastIdRef.current = getItemId(openItem)
      lastSegRef.current = leafSeg
    }
  }, [openItem, leafSeg, getItemId])

  // Corps de resynchro, identique quel que soit le timing.
  const resync = useCallback(() => {
    if (leafSeg === undefined || openItem !== null) return
    if (leafSeg !== lastSegRef.current) return
    const id = lastIdRef.current
    if (id === null) return
    const fresh = items.find((item) => getItemId(item) === id)
    if (!fresh) return
    goToItem(fresh, { replace: true })
  }, [leafSeg, openItem, items, getItemId, goToItem])

  // Un seul des deux effets agit (layout constant pour un point d'appel donné) ;
  // les deux sont déclarés inconditionnellement (règles des hooks).
  useEffect(() => {
    if (!layout) resync()
  }, [resync, layout])
  useLayoutEffect(() => {
    if (layout) resync()
  }, [resync, layout])
}
