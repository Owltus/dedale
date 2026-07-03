import { useEffect, useRef } from 'react'

interface UseLeafResyncOptions<T extends { id: string }> {
  /** Segment de FEUILLE de l'URL (undefined = pas de détail ouvert). */
  leafSeg: string | undefined
  /** Élément résolu depuis `leafSeg` (null = segment irrésolu ou pas de feuille). */
  openItem: T | null
  /** Liste fraîche où retrouver l'élément par id (renommé → slug changé). */
  items: readonly T[]
  /**
   * Réécrit l'URL sur le chemin frais de l'élément — typiquement le `goToX`
   * (mémoïsé `useCallback`) du panneau, appelé avec `{ replace: true }`.
   */
  goToItem: (item: T, opts: { replace: boolean }) => void
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
 * Usage :
 * ```tsx
 * useLeafResync({ leafSeg, openItem: openModele, items: modeles, goToItem: goToModele })
 * ```
 */
export function useLeafResync<T extends { id: string }>({
  leafSeg,
  openItem,
  items,
  goToItem,
}: UseLeafResyncOptions<T>): void {
  const lastIdRef = useRef<string | null>(null)
  const lastSegRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (openItem !== null) {
      lastIdRef.current = openItem.id
      lastSegRef.current = leafSeg
    }
  }, [openItem, leafSeg])

  useEffect(() => {
    if (leafSeg === undefined || openItem !== null) return
    if (leafSeg !== lastSegRef.current) return
    const id = lastIdRef.current
    if (id === null) return
    const fresh = items.find((item) => item.id === id)
    if (!fresh) return
    goToItem(fresh, { replace: true })
  }, [leafSeg, openItem, items, goToItem])
}
