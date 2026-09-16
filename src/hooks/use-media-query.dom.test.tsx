import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMediaQuery } from './use-media-query'

/**
 * ORACLES de `useMediaQuery` (JSDoc du hook + repli responsive de la sidebar) :
 *  O1. Reflète l'état COURANT de la media query au premier rendu (pas de flash :
 *      la sidebar ne doit pas s'ouvrir puis se replier).
 *  O2. Réagit aux changements de taille (abonnement `change`).
 *  O3. AUCUNE FUITE : l'abonnement est retiré au démontage, et un changement de
 *      requête désabonne l'ancienne avant d'abonner la nouvelle.
 */

interface FausseMql {
  matches: boolean
  media: string
  ecouteurs: Set<() => void>
  addEventListener: (type: string, cb: () => void) => void
  removeEventListener: (type: string, cb: () => void) => void
}

const mqls = new Map<string, FausseMql>()
const matchMediaOrigine = window.matchMedia.bind(window)

function installer(etats: Record<string, boolean>): void {
  mqls.clear()
  for (const [media, matches] of Object.entries(etats)) {
    const ecouteurs = new Set<() => void>()
    mqls.set(media, {
      matches,
      media,
      ecouteurs,
      addEventListener: (_type, cb) => ecouteurs.add(cb),
      removeEventListener: (_type, cb) => ecouteurs.delete(cb),
    })
  }
  window.matchMedia = ((query: string) => {
    const mql = mqls.get(query)
    if (mql === undefined)
      throw new Error(`media query non déclarée : ${query}`)
    return mql
  }) as unknown as typeof window.matchMedia
}

/** Simule un redimensionnement : bascule l'état puis notifie les abonnés. */
function basculer(media: string, matches: boolean): void {
  const mql = mqls.get(media)
  if (mql === undefined) throw new Error(`media query non déclarée : ${media}`)
  mql.matches = matches
  act(() => {
    for (const cb of mql.ecouteurs) cb()
  })
}

afterEach(() => {
  window.matchMedia = matchMediaOrigine
  mqls.clear()
})

describe('useMediaQuery', () => {
  it('reflète l’état courant dès le premier rendu (O1)', () => {
    installer({ '(min-width: 1024px)': true, '(max-width: 767px)': false })

    const large = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(large.result.current).toBe(true)

    const etroit = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(etroit.result.current).toBe(false)
  })

  it('suit les changements de taille (O2)', () => {
    installer({ '(min-width: 1024px)': false })
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)

    basculer('(min-width: 1024px)', true)
    expect(result.current).toBe(true)

    basculer('(min-width: 1024px)', false)
    expect(result.current).toBe(false)
  })

  it('retire son abonnement au démontage (O3)', () => {
    installer({ '(min-width: 1024px)': false })
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    const mql = mqls.get('(min-width: 1024px)')
    expect(mql?.ecouteurs.size).toBe(1)

    unmount()
    // O3 : plus aucun abonné → pas de setState sur un composant démonté.
    expect(mql?.ecouteurs.size).toBe(0)
  })

  it('bascule d’une requête à l’autre sans laisser d’abonné derrière (O3)', () => {
    installer({ '(min-width: 1024px)': true, '(max-width: 767px)': false })
    const { rerender } = renderHook(
      ({ q }: { q: string }) => useMediaQuery(q),
      { initialProps: { q: '(min-width: 1024px)' } },
    )
    expect(mqls.get('(min-width: 1024px)')?.ecouteurs.size).toBe(1)

    rerender({ q: '(max-width: 767px)' })
    expect(mqls.get('(min-width: 1024px)')?.ecouteurs.size).toBe(0)
    expect(mqls.get('(max-width: 767px)')?.ecouteurs.size).toBe(1)
  })
})
