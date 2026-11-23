import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { useLargeur } from '@/features/dashboard/frise-axe'
import {
  useElementHeight,
  useParentClientHeight,
} from '@/features/dashboard/use-lignes-visibles'
import { useColonnesAuto } from '@/features/planning/use-colonnes-auto'

/**
 * ORACLES de la mesure suivie (`ResizeObserver` + `requestAnimationFrame`) :
 *  O1. Relevé initial SYNCHRONE au montage (pas de flash à 0).
 *  O2. Une notification du `ResizeObserver` ne relève qu'au rAF suivant.
 *  O3. Démontage : observateur déconnecté, rAF en attente annulé.
 *  O4. Ref nulle au montage : 0, puis mesure dès que `actif` change.
 *  O5. Variante « parent » : c'est le parent qui est observé et mesuré.
 */

type Rappel = () => void
let observateurs: { rappel: Rappel; cibles: Element[]; actif: boolean }[] = []
let rafs = new Map<number, FrameRequestCallback>()
let prochainRaf = 1
const origine = {
  ro: globalThis.ResizeObserver,
  raf: globalThis.requestAnimationFrame,
  caf: globalThis.cancelAnimationFrame,
}

beforeEach(() => {
  observateurs = []
  rafs = new Map()
  prochainRaf = 1
  globalThis.ResizeObserver = class {
    private o: { rappel: Rappel; cibles: Element[]; actif: boolean }
    constructor(rappel: Rappel) {
      this.o = { rappel, cibles: [], actif: true }
      observateurs.push(this.o)
    }
    observe(el: Element) {
      this.o.cibles.push(el)
    }
    disconnect() {
      this.o.actif = false
    }
  } as unknown as typeof ResizeObserver
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = prochainRaf++
    rafs.set(id, cb)
    return id
  }
  globalThis.cancelAnimationFrame = (id: number) => {
    rafs.delete(id)
  }
})

afterEach(() => {
  globalThis.ResizeObserver = origine.ro
  globalThis.requestAnimationFrame = origine.raf
  globalThis.cancelAnimationFrame = origine.caf
})

function element(dims: { w?: number; h?: number }): HTMLElement & {
  dims: { w: number; h: number }
} {
  const el = Object.assign(document.createElement('div'), {
    dims: { w: dims.w ?? 0, h: dims.h ?? 0 },
  })
  Object.defineProperty(el, 'clientWidth', { get: () => el.dims.w })
  Object.defineProperty(el, 'clientHeight', { get: () => el.dims.h })
  return el
}

function notifier(): void {
  for (const o of observateurs) if (o.actif) o.rappel()
}

function viderRafs(): void {
  act(() => {
    const enAttente = [...rafs.values()]
    rafs.clear()
    for (const cb of enAttente) cb(0)
  })
}

describe('mesure suivie des dimensions', () => {
  it('useElementHeight : relevé initial, maj au rAF, nettoyage', () => {
    const el = element({ h: 120 })
    const ref: RefObject<HTMLElement | null> = { current: el }
    const { result, unmount } = renderHook(() => useElementHeight(ref))
    expect(result.current).toBe(120)
    expect(observateurs[0]?.cibles).toEqual([el])

    el.dims.h = 300
    notifier()
    expect(result.current).toBe(120)
    viderRafs()
    expect(result.current).toBe(300)

    el.dims.h = 50
    notifier()
    expect(rafs.size).toBe(1)
    unmount()
    expect(rafs.size).toBe(0)
    expect(observateurs[0]?.actif).toBe(false)
  })

  it('useElementHeight : ref nulle puis `actif` → la mesure reprend', () => {
    const ref: RefObject<HTMLElement | null> = { current: null }
    const { result, rerender } = renderHook(
      ({ actif }) => useElementHeight(ref, actif),
      { initialProps: { actif: false } },
    )
    expect(result.current).toBe(0)
    expect(observateurs).toHaveLength(0)
    ref.current = element({ h: 80 })
    rerender({ actif: true })
    expect(result.current).toBe(80)
  })

  it('useParentClientHeight : mesure et observe le parent', () => {
    const parent = element({ h: 640 })
    const enfant = element({ h: 10 })
    parent.appendChild(enfant)
    const ref: RefObject<HTMLElement | null> = { current: enfant }
    const { result } = renderHook(() => useParentClientHeight(ref))
    expect(result.current).toBe(640)
    expect(observateurs[0]?.cibles).toEqual([parent])
    parent.dims.h = 700
    notifier()
    viderRafs()
    expect(result.current).toBe(700)
  })

  it('useLargeur : élément nul → 0, puis largeur suivie', () => {
    const el = element({ w: 512 })
    const { result, rerender } = renderHook(
      ({ cible }: { cible: HTMLElement | null }) => useLargeur(cible),
      { initialProps: { cible: null as HTMLElement | null } },
    )
    expect(result.current).toBe(0)
    rerender({ cible: el })
    expect(result.current).toBe(512)
    el.dims.w = 800
    notifier()
    viderRafs()
    expect(result.current).toBe(800)
  })

  it('useColonnesAuto : colonnes calculées sur la largeur mesurée', () => {
    const el = element({ w: 160 + 24 * 20 + 5 })
    const ref: RefObject<HTMLElement | null> = { current: el }
    const { result } = renderHook(() => useColonnesAuto(ref))
    expect(result.current).toEqual({ nbSemaines: 20, familleWidth: 165 })
    el.dims.w = 160 + 24 * 30
    notifier()
    viderRafs()
    expect(result.current).toEqual({ nbSemaines: 30, familleWidth: 160 })
  })
})
