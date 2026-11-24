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
import { demandesQueries } from './queries'
import {
  useCloturerDemande,
  useCreateDemande,
  useDeleteDemande,
  usePrendreEnCharge,
  useReopenDemande,
  useUpdateDemande,
} from './mutations'

/**
 * TESTS DE GEL (phase 0 de l'audit d'architecture du 24/11/2026) : ils figent
 * les écritures de demandes — requêtes, valeurs, invalidation, état après un
 * échec. Création et modification passent par des RPC transactionnelles
 * depuis 175 (étape 3.2) : un seul appel, la base annule tout en cas d'échec.
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))

const SITE = '11111111-1111-1111-1111-111111111111'
const DI = '33333333-3333-3333-3333-333333333333'
const LOCAL = '44444444-4444-4444-4444-444444444444'
const EQUIP = '55555555-5555-5555-5555-555555555555'

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

const valeurs = (p: { local_id?: string; equipement_id?: string } = {}) => ({
  constat: '  Fuite lavabo  ',
  date_constat: '2026-11-24',
  local_id: p.local_id ?? '',
  equipement_id: p.equipement_id ?? '',
})

describe('useCreateDemande — gel (RPC transactionnelle, 175)', () => {
  it('DI seule : 1 appel creer_demande (constat nettoyé, sans liaison), puis invalidation', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateDemande(), { wrapper })
    result.current.mutate({ siteId: SITE, values: valeurs() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['rpc:creer_demande args'])
    expect(enr.courant.requetes[0]!.appels[0]).toEqual([
      'args',
      {
        p_site_id: SITE,
        p_constat: 'Fuite lavabo',
        p_date_constat: '2026-11-24',
        p_local_id: undefined,
        p_equipement_id: undefined,
      },
    ])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: demandesQueries.all(),
    })
  })

  it('avec lieu et équipement : TOUT part dans le même appel', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useCreateDemande(), { wrapper })
    result.current.mutate({
      siteId: SITE,
      values: valeurs({ local_id: LOCAL, equipement_id: EQUIP }),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['rpc:creer_demande args'])
    expect(enr.courant.requetes[0]!.appels[0]).toMatchObject([
      'args',
      { p_local_id: LOCAL, p_equipement_id: EQUIP },
    ])
  })

  it('échec : une seule requête, rien d’invalidé (la base annule tout)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }], echecA: 1 })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateDemande(), { wrapper })
    result.current.mutate({
      siteId: SITE,
      values: valeurs({ local_id: LOCAL, equipement_id: EQUIP }),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sequence(enr.courant)).toEqual(['rpc:creer_demande args'])
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('changements de statut — gel', () => {
  const cas = [
    ['prendre en charge', usePrendreEnCharge, 2],
    ['clôturer', useCloturerDemande, 3],
    ['rouvrir', useReopenDemande, 1],
  ] as const
  for (const [nom, hook, statut] of cas) {
    it(`${nom} : UPDATE statut_di_id=${String(statut)} sur la DI, puis invalidation`, async () => {
      enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
      const { wrapper, invalidations } = harnais()
      const { result } = renderHook(() => hook(), { wrapper })
      result.current.mutate(DI)
      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(sequence(enr.courant)).toEqual([
        'from:demandes_intervention update',
      ])
      expect(enr.courant.requetes[0]!.appels).toContainEqual([
        'update',
        { statut_di_id: statut },
      ])
      expect(enr.courant.requetes[0]!.appels).toContainEqual(['eq', 'id', DI])
      expect(invalidations).toHaveBeenCalledWith({
        queryKey: demandesQueries.all(),
      })
    })
  }
})

describe('useUpdateDemande — gel (RPC transactionnelle, 175)', () => {
  it('demandeur (liaisons null) : p_liaisons=false, seul le constat bouge', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateDemande(), { wrapper })
    result.current.mutate({ id: DI, constat: ' Nouveau ', liaisons: null })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['rpc:modifier_demande args'])
    expect(enr.courant.requetes[0]!.appels[0]).toEqual([
      'args',
      {
        p_id: DI,
        p_constat: 'Nouveau',
        p_liaisons: false,
        p_local_id: undefined,
        p_equipement_id: undefined,
      },
    ])
  })

  it('rôle métier : remise à plat des liaisons dans le même appel (vide → absent)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateDemande(), { wrapper })
    result.current.mutate({
      id: DI,
      constat: 'x',
      liaisons: { localId: LOCAL, equipementId: '' },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['rpc:modifier_demande args'])
    expect(enr.courant.requetes[0]!.appels[0]).toEqual([
      'args',
      {
        p_id: DI,
        p_constat: 'x',
        p_liaisons: true,
        p_local_id: LOCAL,
        p_equipement_id: undefined,
      },
    ])
  })
})

describe('useDeleteDemande — gel', () => {
  it('suppression de la DI (le CASCADE nettoie les liaisons), puis invalidation', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useDeleteDemande(), { wrapper })
    result.current.mutate(DI)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['from:demandes_intervention delete'])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: demandesQueries.all(),
    })
  })
})
