import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useLongPress } from './use-long-press'

/**
 * ORACLES de `useLongPress` (JSDoc du hook) :
 *  O1. Déclenche APRÈS `delay` si le doigt reste posé ; jamais avant.
 *  O2. La SOURIS est ignorée (le clic droit desktop fait déjà l'équivalent).
 *  O3. Un geste annulé (relâchement, sortie, `pointercancel` du scroll, glissement
 *      au-delà du seuil) n'ouvre RIEN — un menu qui s'ouvre pendant un défilement
 *      est le bug visé.
 *  O4. MULTI-TOUCH : seul le pointeur ACTIF pilote l'appui ; un 2e doigt ne doit ni
 *      écraser ni annuler le timer en cours.
 *  O5. AUCUNE FUITE : un timer en attente au démontage ne déclenche jamais après
 *      coup (le composant a disparu de l'écran).
 */

function pointeur(
  p: Partial<{
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
  }> = {},
): ReactPointerEvent {
  return {
    pointerId: p.pointerId ?? 1,
    pointerType: p.pointerType ?? 'touch',
    clientX: p.clientX ?? 100,
    clientY: p.clientY ?? 100,
  } as ReactPointerEvent
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useLongPress — déclenchement (O1/O2)', () => {
  it('déclenche après le délai, pas avant', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))

    result.current.onPointerDown(pointeur())
    vi.advanceTimersByTime(399)
    expect(onLongPress).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('ignore la souris (O2)', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true))
    result.current.onPointerDown(pointeur({ pointerType: 'mouse' }))
    vi.advanceTimersByTime(2000)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('ne fait rien quand le hook est désactivé', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, false))
    result.current.onPointerDown(pointeur())
    vi.advanceTimersByTime(2000)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('appelle le DERNIER callback fourni (lu via une ref)', () => {
    const premier = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useLongPress(cb, true, 400),
      { initialProps: { cb: premier as () => void } },
    )
    result.current.onPointerDown(pointeur())
    rerender({ cb: second })
    vi.advanceTimersByTime(400)
    expect(premier).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('useLongPress — annulations (O3)', () => {
  it('annule au relâchement avant le délai', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur())
    vi.advanceTimersByTime(200)
    result.current.onPointerUp(pointeur())
    vi.advanceTimersByTime(400)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('annule à la sortie du pointeur', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur())
    result.current.onPointerLeave(pointeur())
    vi.advanceTimersByTime(400)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('annule sur pointercancel (le navigateur s’approprie le défilement)', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur())
    result.current.onPointerCancel(pointeur())
    vi.advanceTimersByTime(400)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('annule dès que le doigt glisse au-delà du seuil (scroll)', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur({ clientX: 100, clientY: 100 }))
    result.current.onPointerMove(pointeur({ clientX: 100, clientY: 120 }))
    vi.advanceTimersByTime(400)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('tolère un micro-tremblement sous le seuil', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur({ clientX: 100, clientY: 100 }))
    result.current.onPointerMove(pointeur({ clientX: 108, clientY: 106 }))
    vi.advanceTimersByTime(400)
    // O3 : un doigt n'est jamais parfaitement immobile — 10 px de tolérance.
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })
})

describe('useLongPress — multi-touch (O4)', () => {
  it('ignore un second doigt sans écraser l’appui en cours', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur({ pointerId: 1 }))
    vi.advanceTimersByTime(200)
    result.current.onPointerDown(pointeur({ pointerId: 2 }))
    vi.advanceTimersByTime(200)
    // O4 : un seul déclenchement, à l'échéance du PREMIER doigt.
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('n’annule pas l’appui actif quand un AUTRE doigt se lève', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur({ pointerId: 1 }))
    result.current.onPointerUp(pointeur({ pointerId: 2 }))
    result.current.onPointerMove(pointeur({ pointerId: 2, clientY: 500 }))
    vi.advanceTimersByTime(400)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })
})

describe('useLongPress — démontage (O5)', () => {
  it('ne déclenche jamais après le démontage (pas de timer orphelin)', () => {
    const onLongPress = vi.fn()
    const { result, unmount } = renderHook(() =>
      useLongPress(onLongPress, true, 400),
    )
    result.current.onPointerDown(pointeur())
    unmount()
    vi.advanceTimersByTime(2000)
    // O5 : la carte a disparu (navigation, filtre) → aucun menu fantôme.
    expect(onLongPress).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('laisse le minuteur propre après un geste terminé', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, true, 400))
    result.current.onPointerDown(pointeur())
    result.current.onPointerUp(pointeur())
    expect(vi.getTimerCount()).toBe(0)
  })
})
