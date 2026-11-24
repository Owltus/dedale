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
 * le comportement ACTUEL des écritures de demandes — tables touchées, ordre,
 * valeurs, invalidation, et ce qu'il reste quand une étape échoue — avant
 * toute réorganisation. Un changement voulu (ex. passage à une RPC
 * transactionnelle) doit modifier ces tests EXPRÈS.
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))

const SITE = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'
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

describe('useCreateDemande — gel', () => {
  it('DI seule : 1 insertion (constat nettoyé), puis invalidation des demandes', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateDemande(), { wrapper })
    result.current.mutate({ siteId: SITE, createdBy: USER, values: valeurs() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['from:demandes_intervention insert'])
    expect(enr.courant.requetes[0]!.appels[0]).toEqual([
      'insert',
      {
        site_id: SITE,
        created_by: USER,
        constat: 'Fuite lavabo',
        date_constat: '2026-11-24',
      },
    ])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: demandesQueries.all(),
    })
  })

  it('avec lieu et équipement : DI, puis lieu, puis équipement (3 requêtes)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useCreateDemande(), { wrapper })
    result.current.mutate({
      siteId: SITE,
      createdBy: USER,
      values: valeurs({ local_id: LOCAL, equipement_id: EQUIP }),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual([
      'from:demandes_intervention insert',
      'from:di_localisations insert',
      'from:di_equipements insert',
    ])
    expect(enr.courant.requetes[1]!.appels[0]).toEqual([
      'insert',
      { di_id: DI, local_id: LOCAL },
    ])
  })

  it('ÉTAT ACTUEL : si le lieu échoue, la DI reste créée (pas de transaction) et rien n’est invalidé', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }], echecA: 2 })
    const { wrapper, invalidations } = harnais()
    const { result } = renderHook(() => useCreateDemande(), { wrapper })
    result.current.mutate({
      siteId: SITE,
      createdBy: USER,
      values: valeurs({ local_id: LOCAL, equipement_id: EQUIP }),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    // La DI a été insérée, le lieu a échoué, l'équipement n'a pas été tenté.
    expect(sequence(enr.courant)).toEqual([
      'from:demandes_intervention insert',
      'from:di_localisations insert',
    ])
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

describe('useUpdateDemande — gel', () => {
  it('demandeur (liaisons null) : seul le constat est modifié', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateDemande(), { wrapper })
    result.current.mutate({ id: DI, constat: ' Nouveau ', liaisons: null })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual(['from:demandes_intervention update'])
    expect(enr.courant.requetes[0]!.appels[0]).toEqual([
      'update',
      { constat: 'Nouveau' },
    ])
  })

  it('rôle métier : constat, puis lieux supprimés et réinsérés, puis équipements', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }] })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateDemande(), { wrapper })
    result.current.mutate({
      id: DI,
      constat: 'x',
      liaisons: { localId: LOCAL, equipementId: '' },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sequence(enr.courant)).toEqual([
      'from:demandes_intervention update',
      'from:di_localisations delete',
      'from:di_localisations insert',
      'from:di_equipements delete',
    ])
  })

  it('ÉTAT ACTUEL : si la réinsertion du lieu échoue, l’ancien lieu est déjà supprimé', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DI }], echecA: 3 })
    const { wrapper } = harnais()
    const { result } = renderHook(() => useUpdateDemande(), { wrapper })
    result.current.mutate({
      id: DI,
      constat: 'x',
      liaisons: { localId: LOCAL, equipementId: EQUIP },
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(sequence(enr.courant)).toEqual([
      'from:demandes_intervention update',
      'from:di_localisations delete',
      'from:di_localisations insert',
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
