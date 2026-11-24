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
import { useCreateTravaux, useUpdateTravaux } from './mutations'
import { travauxQueries } from './queries'
import { emptyTravaux } from './schemas'
import {
  useCreateEvenement,
  useUpdateEvenement,
} from '@/features/evenements/mutations'
import { evenementsQueries } from '@/features/evenements/queries'
import { emptyEvenement } from '@/features/evenements/schemas'

/**
 * TESTS DE GEL (phase 0 de l'audit d'architecture) — complément de
 * `taches-sync.dom.test.tsx`, qui fige déjà les séquences nominales : ici, les
 * INVALIDATIONS et l'état laissé quand une étape échoue (aucune transaction).
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

const uneTache = [{ libelle: 'Peinture', local_id: 'L1', equipement_id: '' }]

describe('Travaux — gel des invalidations et des échecs', () => {
  it('création réussie : invalide la liste et les tâches du travaux', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'T' }] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      createdBy: 'U',
      values: { ...emptyTravaux('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: travauxQueries.all(),
    })
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: travauxQueries.taches('T').queryKey,
    })
  })

  it('ÉTAT ACTUEL : si les tâches échouent, le travaux reste créé sans elles', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'T' }], echecA: 2 })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      createdBy: 'U',
      values: { ...emptyTravaux('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sequence(enr.courant)).toEqual([
      'from:interventions_travaux insert',
      'from:travaux_taches insert',
    ])
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('ÉTAT ACTUEL : modification — si l’ajout échoue, les tâches retirées le sont déjà', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'T' }], echecA: 3 })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateTravaux(), { wrapper })
    result.current.mutate({
      id: 'T',
      values: { ...emptyTravaux('2026-11-24'), titre: 'x' },
      createdBy: 'U',
      existants: [
        { id: 'A', libelle: 'Retirée', local_id: '', equipement_id: '' },
      ],
      taches: uneTache,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sequence(enr.courant)).toEqual([
      'from:interventions_travaux update',
      'from:travaux_taches delete',
      'from:travaux_taches insert',
    ])
  })
})

describe('Événements — gel des invalidations et des échecs', () => {
  it('création réussie : invalide la liste et les lieux de l’événement', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E' }] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateEvenement(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      createdBy: 'U',
      values: { ...emptyEvenement('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.all(),
    })
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.lieux('E').queryKey,
    })
  })

  it('ÉTAT ACTUEL : si les tâches échouent, l’événement reste créé sans elles', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E' }], echecA: 2 })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useCreateEvenement(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      createdBy: 'U',
      values: { ...emptyEvenement('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sequence(enr.courant)).toEqual([
      'from:evenements insert',
      'from:evenements_lieux insert',
    ])
  })

  it('modification sans tâches fournies : seul l’événement est mis à jour', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E' }] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateEvenement(), { wrapper })
    result.current.mutate({
      id: 'E',
      values: { ...emptyEvenement('2026-11-24'), titre: 'x' },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sequence(enr.courant)).toEqual(['from:evenements update'])
  })
})
