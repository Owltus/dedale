import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSyncGammeEquipements } from './mutations'
import { useSyncEquipementGammes } from '@/features/equipements/mutations'

// Client Supabase ENREGISTREUR : chaque chaîne `.from(...)` note ses appels
// (méthode + arguments) ; `throwOnError()` clôt la chaîne et résout.
const appels = vi.hoisted(() => [] as [string, unknown[]][][])

vi.mock('@/lib/supabase', () => {
  function chaine(trace: [string, unknown[]][]): unknown {
    return new Proxy(
      {},
      {
        get(_cible, propriete) {
          if (propriete === 'then') return undefined
          if (propriete === 'throwOnError') {
            return () => Promise.resolve({ data: [], error: null })
          }
          return (...args: unknown[]) => {
            trace.push([String(propriete), args])
            return chaine(trace)
          }
        },
      },
    )
  }
  return {
    supabase: {
      from: (table: string) => {
        const trace: [string, unknown[]][] = [['from', [table]]]
        appels.push(trace)
        return chaine(trace)
      },
    },
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  appels.length = 0
})

/**
 * GEL : la synchronisation de `gammes_equipements` se fait des deux côtés
 * (fiche gamme, fiche équipement). Avec current=[a,b] et selected=[b,c], on
 * insère c puis on supprime a — et rien d'autre.
 */
describe('synchronisation gammes_equipements', () => {
  it('côté gamme : insère c, supprime a', async () => {
    const { result } = renderHook(() => useSyncGammeEquipements(), {
      wrapper,
    })
    await result.current.mutateAsync({
      gammeId: 'G',
      current: ['a', 'b'],
      selected: ['b', 'c'],
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels).toEqual([
      [
        ['from', ['gammes_equipements']],
        ['insert', [[{ gamme_id: 'G', equipement_id: 'c' }]]],
      ],
      [
        ['from', ['gammes_equipements']],
        ['delete', []],
        ['eq', ['gamme_id', 'G']],
        ['in', ['equipement_id', ['a']]],
      ],
    ])
  })

  it('côté équipement : insère c, supprime a', async () => {
    const { result } = renderHook(() => useSyncEquipementGammes(), {
      wrapper,
    })
    await result.current.mutateAsync({
      equipementId: 'E',
      current: ['a', 'b'],
      selected: ['b', 'c'],
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels).toEqual([
      [
        ['from', ['gammes_equipements']],
        ['insert', [[{ gamme_id: 'c', equipement_id: 'E' }]]],
      ],
      [
        ['from', ['gammes_equipements']],
        ['delete', []],
        ['eq', ['equipement_id', 'E']],
        ['in', ['gamme_id', ['a']]],
      ],
    ])
  })

  it('sans différence : aucun appel', async () => {
    const { result } = renderHook(() => useSyncGammeEquipements(), {
      wrapper,
    })
    await result.current.mutateAsync({
      gammeId: 'G',
      current: ['a'],
      selected: ['a'],
    })
    expect(appels).toEqual([])
  })
})
