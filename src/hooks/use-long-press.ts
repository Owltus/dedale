import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  onPointerLeave: (e: ReactPointerEvent) => void
  onPointerCancel: (e: ReactPointerEvent) => void
}

/**
 * Appui long tactile : déclenche `onLongPress` si le pointeur reste posé `delay`
 * ms sans déplacement notable. La SOURIS est ignorée (le double-clic desktop fait
 * déjà l'équivalent) → ne concerne que le tactile/stylet. `enabled` à false → no-op.
 * `onLongPress` est lu via une ref (pas de re-création du timer à chaque rendu).
 *
 * Robustesse : on suit l'`pointerId` actif et on n'agit que sur LUI — un 2e doigt
 * (multi-touch) est ignoré au lieu d'écraser le timer (sinon timer orphelin =
 * bascule fantôme). `onPointerCancel` (scroll-lock du navigateur) annule l'appui :
 * sans lui, le timer survivrait au défilement et basculerait par erreur.
 */
export function useLongPress(
  onLongPress: () => void,
  enabled: boolean,
  delay = 400,
): LongPressHandlers {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const pointerId = useRef<number | null>(null)
  const cbRef = useRef(onLongPress)
  useEffect(() => {
    cbRef.current = onLongPress
  }, [onLongPress])

  // Nettoyage au démontage : un timer en attente ne doit pas déclencher après coup.
  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    start.current = null
    pointerId.current = null
  }

  return {
    onPointerDown: (e) => {
      if (!enabled || e.pointerType === 'mouse') return
      // Un appui est déjà en cours (multi-touch) → on ignore les pointeurs suivants.
      if (pointerId.current !== null) return
      pointerId.current = e.pointerId
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = window.setTimeout(() => cbRef.current(), delay)
    },
    onPointerMove: (e) => {
      if (pointerId.current !== e.pointerId || start.current === null) return
      // Le doigt glisse (scroll / sélection) au-delà du seuil → on annule l'appui long.
      if (
        Math.abs(e.clientX - start.current.x) > 10 ||
        Math.abs(e.clientY - start.current.y) > 10
      ) {
        clear()
      }
    },
    onPointerUp: (e) => {
      if (pointerId.current === e.pointerId) clear()
    },
    onPointerLeave: (e) => {
      if (pointerId.current === e.pointerId) clear()
    },
    // Le navigateur s'approprie le geste (défilement) → l'appui long est annulé.
    onPointerCancel: (e) => {
      if (pointerId.current === e.pointerId) clear()
    },
  }
}
