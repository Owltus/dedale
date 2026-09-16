import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileDrop } from './use-file-drop'

/**
 * ORACLES de `useFileDrop` (JSDoc du hook + patron « drop pleine page ») :
 *  O1. PORTÉE = durée de vie du composant : tout écouteur posé sur `window` au
 *      montage est retiré au démontage, AVEC LA MÊME RÉFÉRENCE (sinon fuite : la
 *      page suivante recevrait encore les drops de la précédente).
 *  O2. `enabled: false` → AUCUN écouteur (le navigateur reprend la main).
 *  O3. Le compteur de profondeur ignore les `dragleave` des éléments enfants :
 *      `dragging` ne retombe qu'au dernier.
 *  O4. Un glisser SANS fichier (texte, lien) est ignoré de bout en bout, et le
 *      `preventDefault` n'est posé que sur les glissers de FICHIERS.
 *  O5. `onFiles` est lu via une ref : changer le callback ne réabonne pas les
 *      écouteurs, mais c'est bien le DERNIER qui est appelé.
 */

const EVENEMENTS = ['dragenter', 'dragover', 'dragleave', 'drop']

/** Événement de drag minimal : jsdom n'implémente ni `DragEvent` ni `DataTransfer`. */
function evenementDrag(
  type: string,
  opts: { types?: string[]; files?: File[] } = {},
): Event {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'dataTransfer', {
    value: { types: opts.types ?? ['Files'], files: opts.files ?? [] },
  })
  return e
}

function envoyer(e: Event): void {
  act(() => {
    window.dispatchEvent(e)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useFileDrop — cycle de vie des écouteurs (O1/O2)', () => {
  it('pose puis retire exactement ses écouteurs sur window', () => {
    const ajout = vi.spyOn(window, 'addEventListener')
    const retrait = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useFileDrop({ onFiles: vi.fn() }))

    const poses = ajout.mock.calls.filter(([type]) => EVENEMENTS.includes(type))
    expect(poses.map(([type]) => type).sort()).toEqual([...EVENEMENTS].sort())

    unmount()

    const retires = retrait.mock.calls.filter(([type]) =>
      EVENEMENTS.includes(type),
    )
    // O1 : même nombre ET mêmes références (un handler recréé ne se retire pas).
    expect(retires).toHaveLength(poses.length)
    for (const [type, handler] of poses) {
      expect(retires.some(([t, h]) => t === type && h === handler)).toBe(true)
    }
  })

  it('ne pose AUCUN écouteur quand enabled est faux (O2)', () => {
    const ajout = vi.spyOn(window, 'addEventListener')
    const onFiles = vi.fn()
    renderHook(() => useFileDrop({ enabled: false, onFiles }))

    expect(
      ajout.mock.calls.filter(([type]) => EVENEMENTS.includes(type)),
    ).toHaveLength(0)

    envoyer(evenementDrag('drop', { files: [new File(['x'], 'plan.pdf')] }))
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('réabonne proprement quand enabled bascule', () => {
    const onFiles = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useFileDrop({ enabled, onFiles }),
      { initialProps: { enabled: false } },
    )
    envoyer(evenementDrag('drop', { files: [new File(['x'], 'a.pdf')] }))
    expect(onFiles).not.toHaveBeenCalled()

    rerender({ enabled: true })
    envoyer(evenementDrag('drop', { files: [new File(['x'], 'a.pdf')] }))
    expect(onFiles).toHaveBeenCalledTimes(1)

    rerender({ enabled: false })
    envoyer(evenementDrag('drop', { files: [new File(['x'], 'a.pdf')] }))
    expect(onFiles).toHaveBeenCalledTimes(1)
  })
})

describe('useFileDrop — survol et profondeur (O3)', () => {
  it('reste en survol tant que tous les dragleave imbriqués ne sont pas passés', () => {
    const { result } = renderHook(() => useFileDrop({ onFiles: vi.fn() }))
    expect(result.current.dragging).toBe(false)

    envoyer(evenementDrag('dragenter')) // entrée dans la page
    expect(result.current.dragging).toBe(true)
    envoyer(evenementDrag('dragenter')) // entrée dans un enfant
    expect(result.current.dragging).toBe(true)

    envoyer(evenementDrag('dragleave')) // sortie de l'enfant
    // O3 : un seul dragleave ne doit pas éteindre la surcouche.
    expect(result.current.dragging).toBe(true)

    envoyer(evenementDrag('dragleave')) // sortie de la page
    expect(result.current.dragging).toBe(false)
  })

  it('ne descend jamais sous zéro (dragleave orphelins)', () => {
    const { result } = renderHook(() => useFileDrop({ onFiles: vi.fn() }))
    envoyer(evenementDrag('dragleave'))
    envoyer(evenementDrag('dragleave'))
    expect(result.current.dragging).toBe(false)

    envoyer(evenementDrag('dragenter'))
    // Le compteur n'a pas été rendu négatif : une seule entrée suffit à survoler.
    expect(result.current.dragging).toBe(true)
  })

  it('un drop remet le survol à zéro même après plusieurs entrées', () => {
    const { result } = renderHook(() => useFileDrop({ onFiles: vi.fn() }))
    envoyer(evenementDrag('dragenter'))
    envoyer(evenementDrag('dragenter'))
    envoyer(evenementDrag('drop', { files: [new File(['x'], 'a.pdf')] }))
    expect(result.current.dragging).toBe(false)
  })
})

describe('useFileDrop — contenu déposé (O4/O5)', () => {
  it('transmet TOUS les fichiers déposés et neutralise le comportement navigateur', () => {
    const onFiles = vi.fn<(f: File[]) => void>()
    renderHook(() => useFileDrop({ onFiles }))

    const fichiers = [
      new File(['a'], 'plan.pdf', { type: 'application/pdf' }),
      new File(['b'], 'photo.webp', { type: 'image/webp' }),
    ]
    const e = evenementDrag('drop', { files: fichiers })
    envoyer(e)

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles.mock.calls[0]?.[0]).toEqual(fichiers)
    // O4 : sans preventDefault, le navigateur ouvrirait le fichier dans l'onglet.
    expect(e.defaultPrevented).toBe(true)
  })

  it('ignore un glisser sans fichier (texte, lien) (O4)', () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileDrop({ onFiles }))

    const entree = evenementDrag('dragenter', { types: ['text/plain'] })
    envoyer(entree)
    expect(result.current.dragging).toBe(false)
    expect(entree.defaultPrevented).toBe(false)

    const drop = evenementDrag('drop', { types: ['text/uri-list'] })
    envoyer(drop)
    expect(onFiles).not.toHaveBeenCalled()
    expect(drop.defaultPrevented).toBe(false)
  })

  it('ignore un drop de fichiers VIDE (aucun fichier réellement transmis)', () => {
    const onFiles = vi.fn()
    renderHook(() => useFileDrop({ onFiles }))
    envoyer(evenementDrag('drop', { types: ['Files'], files: [] }))
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('appelle le DERNIER onFiles sans réabonner les écouteurs (O5)', () => {
    const ajout = vi.spyOn(window, 'addEventListener')
    const premier = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ onFiles }: { onFiles: (f: File[]) => void }) =>
        useFileDrop({ onFiles }),
      { initialProps: { onFiles: premier as (f: File[]) => void } },
    )
    const posesInitiales = ajout.mock.calls.filter(([t]) =>
      EVENEMENTS.includes(t),
    ).length

    rerender({ onFiles: second })
    expect(
      ajout.mock.calls.filter(([t]) => EVENEMENTS.includes(t)),
    ).toHaveLength(posesInitiales)

    envoyer(evenementDrag('drop', { files: [new File(['x'], 'a.pdf')] }))
    expect(premier).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
