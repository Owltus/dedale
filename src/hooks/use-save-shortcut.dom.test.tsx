import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSaveShortcut } from './use-save-shortcut'

/**
 * ORACLES de `useSaveShortcut` (JSDoc du hook) :
 *  O1. Ctrl + S (Windows/Linux) ET ⌘ + S (Mac) enregistrent, en neutralisant la
 *      sauvegarde de page du navigateur (`preventDefault`).
 *  O2. Les combinaisons VOISINES ne déclenchent pas : Ctrl+Shift+S (« enregistrer
 *      sous »), Ctrl+Alt+S (= AltGr sur AZERTY français), S seul.
 *  O3. Un maintien de touche (`repeat`) n'enregistre qu'UNE fois.
 *  O4. `enabled: false` → aucun écouteur ; démontage → écouteur retiré avec la
 *      MÊME référence (pas de fuite ni de sauvegarde fantôme sur une autre page).
 */

function frapper(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { cancelable: true, ...init })
  act(() => {
    document.dispatchEvent(e)
  })
  return e
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSaveShortcut — déclenchement (O1)', () => {
  it('enregistre sur Ctrl + S et neutralise le navigateur', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave, true))
    const e = frapper({ key: 's', ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it('enregistre sur ⌘ + S (Mac) et accepte le S majuscule', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave, true))
    frapper({ key: 's', metaKey: true })
    frapper({ key: 'S', ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(2)
  })
})

describe('useSaveShortcut — combinaisons voisines (O2/O3)', () => {
  it('ignore Ctrl+Shift+S, Ctrl+Alt+S (AltGr) et S seul', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave, true))
    const sous = frapper({ key: 's', ctrlKey: true, shiftKey: true })
    const altgr = frapper({ key: 's', ctrlKey: true, altKey: true })
    const seul = frapper({ key: 's' })
    const autre = frapper({ key: 'd', ctrlKey: true })

    expect(onSave).not.toHaveBeenCalled()
    // O2 : ces frappes doivent garder leur comportement natif.
    expect(sous.defaultPrevented).toBe(false)
    expect(altgr.defaultPrevented).toBe(false)
    expect(seul.defaultPrevented).toBe(false)
    expect(autre.defaultPrevented).toBe(false)
  })

  it('n’enregistre pas en rafale quand la touche est maintenue (O3)', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave, true))
    frapper({ key: 's', ctrlKey: true })
    frapper({ key: 's', ctrlKey: true, repeat: true })
    frapper({ key: 's', ctrlKey: true, repeat: true })
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

describe('useSaveShortcut — cycle de vie (O4)', () => {
  it('ne pose aucun écouteur quand il est désactivé', () => {
    const ajout = vi.spyOn(document, 'addEventListener')
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave, false))

    expect(
      ajout.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(0)
    frapper({ key: 's', ctrlKey: true })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('retire son écouteur au démontage, avec la même référence', () => {
    const ajout = vi.spyOn(document, 'addEventListener')
    const retrait = vi.spyOn(document, 'removeEventListener')
    const onSave = vi.fn()
    const { unmount } = renderHook(() => useSaveShortcut(onSave, true))

    const pose = ajout.mock.calls.find(([type]) => type === 'keydown')
    expect(pose).toBeDefined()
    unmount()
    expect(
      retrait.mock.calls.some(
        ([type, handler]) => type === 'keydown' && handler === pose?.[1],
      ),
    ).toBe(true)

    frapper({ key: 's', ctrlKey: true })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('bascule proprement quand enabled change', () => {
    const onSave = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSaveShortcut(onSave, enabled),
      { initialProps: { enabled: false } },
    )
    frapper({ key: 's', ctrlKey: true })
    expect(onSave).not.toHaveBeenCalled()

    rerender({ enabled: true })
    frapper({ key: 's', ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)

    rerender({ enabled: false })
    frapper({ key: 's', ctrlKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('appelle le DERNIER onSave sans ré-attacher l’écouteur', () => {
    const ajout = vi.spyOn(document, 'addEventListener')
    const premier = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useSaveShortcut(cb, true),
      { initialProps: { cb: premier as () => void } },
    )
    const poses = ajout.mock.calls.filter(([t]) => t === 'keydown').length

    rerender({ cb: second })
    expect(ajout.mock.calls.filter(([t]) => t === 'keydown')).toHaveLength(
      poses,
    )

    frapper({ key: 's', ctrlKey: true })
    expect(premier).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
