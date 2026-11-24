import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  clientEnregistreur,
  nouvelEnregistreur,
  sequence,
  type Enregistreur,
} from '@/test/supabase-enregistreur'
import { OT_QUERY_KEYS } from './query-keys'
import { useRafraichirOt, useUpdateOperationExecution } from './mutations'

/**
 * TESTS DE GEL (phase 0 de l'audit d'architecture) : l'enregistrement d'une
 * opération d'OT. État actuel : UNE écriture `operations_execution` par
 * opération. Isolée, elle invalide toutes les clés OT ; l'éditeur, qui en
 * enregistre plusieurs, reporte et rafraîchit UNE fois (étape 1.7).
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))

function harnais() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidations = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { wrapper, invalidations }
}

const saisie = {
  id: 'op-1',
  otId: 'ot-1',
  statut: 'terminee',
  valeurMesuree: 12,
  dateExecution: '2026-11-24T12:00:00.000Z',
  executedBy: 'user-1',
  commentaires: null,
  indexDepose: null,
  indexPose: null,
  dateRemplacement: null,
}

describe('useUpdateOperationExecution — gel', () => {
  it('une opération = une écriture operations_execution, puis invalidation de toutes les clés OT', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'op-1' }] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useUpdateOperationExecution(), {
      wrapper,
    })
    await result.current.mutateAsync(saisie)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['from:operations_execution update'])
    expect(enr.courant.requetes[0]!.appels).toContainEqual(['eq', 'id', 'op-1'])
    for (const queryKey of OT_QUERY_KEYS) {
      expect(invalidations).toHaveBeenCalledWith({ queryKey })
    }
  })

  it('sans report : chaque opération rafraîchit (appel isolé)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{}, {}, {}] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useUpdateOperationExecution(), {
      wrapper,
    })
    for (const id of ['op-1', 'op-2', 'op-3']) {
      await result.current.mutateAsync({ ...saisie, id })
    }
    expect(invalidations).toHaveBeenCalledTimes(3 * OT_QUERY_KEYS.length)
  })

  it('avec report (éditeur, 1.7) : aucune invalidation par opération, une seule via useRafraichirOt', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{}, {}, {}] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(
      () => ({
        maj: useUpdateOperationExecution(),
        rafraichir: useRafraichirOt(),
      }),
      { wrapper },
    )
    for (const id of ['op-1', 'op-2', 'op-3']) {
      await result.current.maj.mutateAsync({
        ...saisie,
        id,
        differerRafraichissement: true,
      })
    }
    expect(enr.courant.requetes).toHaveLength(3)
    expect(invalidations).not.toHaveBeenCalled()
    result.current.rafraichir()
    expect(invalidations).toHaveBeenCalledTimes(OT_QUERY_KEYS.length)
  })
})
