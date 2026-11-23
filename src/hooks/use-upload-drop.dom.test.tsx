import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useUploadDrop } from './use-upload-drop'

/**
 * Gel de `useUploadDrop` : un dépôt pleine page ouvre le dialog pré-rempli (et
 * prévient l'appelant via `onDrop`, ex. bascule d'onglet) ; la fermeture oublie
 * les fichiers ; l'ouverture manuelle part d'une liste vide.
 */

function deposer(files: File[]): void {
  const e = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'dataTransfer', {
    value: { types: ['Files'], files },
  })
  act(() => {
    window.dispatchEvent(e)
  })
}

describe('useUploadDrop', () => {
  it('un dépôt ouvre le dialog avec les fichiers et appelle onDrop', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() =>
      useUploadDrop({ enabled: true, onDrop }),
    )
    expect(result.current.uploadOpen).toBe(false)
    const fichiers = [new File(['a'], 'plan.pdf')]
    deposer(fichiers)
    expect(result.current.uploadOpen).toBe(true)
    expect(result.current.droppedFiles).toEqual(fichiers)
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  it('la fermeture vide la liste ; la réouverture manuelle part vide', () => {
    const { result } = renderHook(() => useUploadDrop({ enabled: true }))
    deposer([new File(['a'], 'plan.pdf')])
    act(() => result.current.onUploadOpenChange(false))
    expect(result.current.uploadOpen).toBe(false)
    expect(result.current.droppedFiles).toEqual([])

    deposer([new File(['b'], 'photo.webp')])
    act(() => result.current.openUploadEmpty())
    expect(result.current.uploadOpen).toBe(true)
    expect(result.current.droppedFiles).toEqual([])
  })

  it('désactivé : un dépôt est ignoré', () => {
    const onDrop = vi.fn()
    const { result } = renderHook(() =>
      useUploadDrop({ enabled: false, onDrop }),
    )
    deposer([new File(['a'], 'plan.pdf')])
    expect(result.current.uploadOpen).toBe(false)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('openUploadEmpty et onUploadOpenChange sont stables entre rendus', () => {
    const { result, rerender } = renderHook(() =>
      useUploadDrop({ enabled: true }),
    )
    const { openUploadEmpty, onUploadOpenChange } = result.current
    rerender()
    expect(result.current.openUploadEmpty).toBe(openUploadEmpty)
    expect(result.current.onUploadOpenChange).toBe(onUploadOpenChange)
  })
})
