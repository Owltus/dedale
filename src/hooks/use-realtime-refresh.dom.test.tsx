import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Faux canal Supabase : on capture le rappel `postgres_changes` pour simuler
// des événements.
const rappels: (() => void)[] = []
vi.mock('@/lib/supabase', () => {
  const canal = {
    on: (_t: string, _f: unknown, cb: () => void) => {
      rappels.push(cb)
      return canal
    },
    subscribe: () => canal,
  }
  return {
    supabase: {
      channel: () => canal,
      removeChannel: () => Promise.resolve(),
    },
  }
})

const { useRealtimeRefresh, DELAI_REGROUPEMENT_MS, ATTENTE_MAX_MS } =
  await import('./use-realtime-refresh')

function monter() {
  const qc = new QueryClient()
  const espion = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const rendu = renderHook(
    () =>
      useRealtimeRefresh('demandes_intervention', ['demandes_intervention']),
    { wrapper },
  )
  return { espion, rendu }
}

describe('useRealtimeRefresh — rafales regroupées', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    rappels.length = 0
  })
  afterEach(() => vi.useRealTimers())

  it('10 événements rapprochés → UNE seule invalidation', () => {
    const { espion, rendu } = monter()
    for (let i = 0; i < 10; i++) {
      rappels.at(-1)!()
      vi.advanceTimersByTime(50)
    }
    expect(espion).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DELAI_REGROUPEMENT_MS)
    expect(espion).toHaveBeenCalledTimes(1)
    rendu.unmount()
  })

  it('rafale continue → invalidation au plus tard après l’attente maximale', () => {
    const { espion, rendu } = monter()
    for (let t = 0; t < ATTENTE_MAX_MS + 500; t += 100) {
      rappels.at(-1)!()
      vi.advanceTimersByTime(100)
    }
    expect(espion.mock.calls.length).toBeGreaterThanOrEqual(1)
    rendu.unmount()
  })

  it('un événement isolé → invalidation après le délai de regroupement', () => {
    const { espion, rendu } = monter()
    rappels.at(-1)!()
    vi.advanceTimersByTime(DELAI_REGROUPEMENT_MS - 1)
    expect(espion).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(espion).toHaveBeenCalledTimes(1)
    rendu.unmount()
  })
})
