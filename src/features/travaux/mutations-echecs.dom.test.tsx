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
 * `taches-sync.dom.test.tsx` : les INVALIDATIONS et l'état après un échec.
 * Depuis 175-176 (étape 3.2), fiche et tâches partent en UN appel RPC
 * transactionnel : un échec n'écrit rien et n'invalide rien.
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
  it('création réussie : un appel enregistrer_travaux, puis invalide la liste et les tâches', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'T' }] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      values: { ...emptyTravaux('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['rpc:enregistrer_travaux args'])
    expect(enr.courant.requetes[0]!.appels[0]).toMatchObject([
      'args',
      {
        p_site_id: 'S',
        p_taches: {
          ajouter: [
            {
              libelle: 'Peinture',
              local_id: 'L1',
              equipement_id: null,
              ordre: 0,
            },
          ],
        },
      },
    ])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: travauxQueries.all(),
    })
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: travauxQueries.taches('T').queryKey,
    })
  })

  it('échec : une seule requête, rien d’invalidé (la base annule fiche ET tâches)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'T' }], echecA: 1 })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      values: { ...emptyTravaux('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sequence(enr.courant)).toEqual(['rpc:enregistrer_travaux args'])
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('modification : le diff (retrait + ajout) part dans le même appel', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'T' }] })
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
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sequence(enr.courant)).toEqual(['rpc:enregistrer_travaux args'])
    expect(enr.courant.requetes[0]!.appels[0]).toMatchObject([
      'args',
      {
        p_id: 'T',
        p_taches: {
          supprimer: ['A'],
          ajouter: [{ libelle: 'Peinture', ordre: 1 }],
          modifier: [],
        },
      },
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
      values: { ...emptyEvenement('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sequence(enr.courant)).toEqual(['rpc:enregistrer_evenement args'])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.all(),
    })
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.lieux('E').queryKey,
    })
  })

  it('échec : une seule requête, rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E' }], echecA: 1 })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateEvenement(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      values: { ...emptyEvenement('2026-11-24'), titre: 'x', taches: uneTache },
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sequence(enr.courant)).toEqual(['rpc:enregistrer_evenement args'])
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('modification sans tâches fournies : p_taches absent, les tâches ne bougent pas', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E' }] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateEvenement(), { wrapper })
    result.current.mutate({
      id: 'E',
      values: { ...emptyEvenement('2026-11-24'), titre: 'x' },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sequence(enr.courant)).toEqual(['rpc:enregistrer_evenement args'])
    expect(enr.courant.requetes[0]!.appels[0]).toMatchObject([
      'args',
      { p_id: 'E', p_taches: undefined },
    ])
  })
})
