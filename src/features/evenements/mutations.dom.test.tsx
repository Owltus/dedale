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
import { evenementsQueries } from './queries'
import { travauxQueries } from '@/features/travaux/queries'
import { STATUT_CLOTURE } from './schemas'
import {
  useChangeStatutEvenement,
  useConvertirEnEvenement,
  useConvertirEnTravaux,
  useDeleteEvenement,
  useToggleVerrouEvenement,
  useUpdateClotureEvenement,
} from './mutations'

/**
 * Écritures des événements hors création/édition (couvertes ailleurs) :
 * conversions Travaux ⇄ Événement, suppression, changement de statut, correction
 * de clôture, verrou. Ce qui part vers la base, ce qui est invalidé, et le refus
 * de la base. Comportement ACTUEL.
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))

const REFUS = { message: 'new row violates row-level security', code: '42501' }

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

function appels(n: number) {
  return enr.courant!.requetes[n]!.appels
}

async function jouer<V>(
  utiliser: () => {
    mutate: (v: V) => void
    isSuccess: boolean
    isError: boolean
    data?: unknown
    error: unknown
  },
  variables: V,
  attendre: 'succes' | 'echec' = 'succes',
) {
  const { wrapper, invalidations } = harnais()
  const { result } = renderHook(utiliser, { wrapper })
  result.current.mutate(variables)
  await waitFor(() =>
    expect(
      attendre === 'succes' ? result.current.isSuccess : result.current.isError,
    ).toBe(true),
  )
  return { result, invalidations }
}

describe('useConvertirEnEvenement', () => {
  it('RPC convertir_travaux_en_evenement, renvoie l’id créé, invalide Travaux ET Événements', async () => {
    enr.courant = nouvelEnregistreur({ reponses: ['E-NOUVEAU'] })
    const { result, invalidations } = await jouer(
      () => useConvertirEnEvenement(),
      'T-1',
    )
    expect(sequence(enr.courant)).toEqual([
      'rpc:convertir_travaux_en_evenement args',
    ])
    expect(appels(0)[0]).toEqual(['args', { p_travaux_id: 'T-1' }])
    expect(result.current.data).toBe('E-NOUVEAU')
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: travauxQueries.all(),
    })
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.all(),
    })
  })

  it('refus : l’erreur remonte, rien n’est invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { result, invalidations } = await jouer(
      () => useConvertirEnEvenement(),
      'T-1',
      'echec',
    )
    expect(result.current.error).toMatchObject(REFUS)
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useConvertirEnTravaux', () => {
  it('RPC convertir_evenement_en_travaux, invalide Événements ET Travaux', async () => {
    enr.courant = nouvelEnregistreur({ reponses: ['T-NOUVEAU'] })
    const { result, invalidations } = await jouer(
      () => useConvertirEnTravaux(),
      'E-1',
    )
    expect(appels(0)[0]).toEqual(['args', { p_evenement_id: 'E-1' }])
    expect(result.current.data).toBe('T-NOUVEAU')
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.all(),
    })
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: travauxQueries.all(),
    })
  })
})

describe('useDeleteEvenement', () => {
  it('DELETE ciblé avec .select().single() (hors périmètre = erreur, pas faux succès)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E-1' }] })
    const { invalidations } = await jouer(() => useDeleteEvenement(), 'E-1')
    expect(appels(0).map(([m]) => m)).toEqual([
      'delete',
      'eq',
      'select',
      'single',
      'throwOnError',
    ])
    expect(appels(0)[1]).toEqual(['eq', 'id', 'E-1'])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.all(),
    })
  })

  it('PGRST116 (aucune ligne) : échec remonté', async () => {
    enr.courant = nouvelEnregistreur({
      echecA: 1,
      erreur: { message: '0 ligne', code: 'PGRST116' },
    })
    const { invalidations } = await jouer(
      () => useDeleteEvenement(),
      'E-1',
      'echec',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useChangeStatutEvenement', () => {
  it('clôture : compte-rendu nettoyé, date et auteur posés, fiche verrouillée', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E-1' }] })
    await jouer(() => useChangeStatutEvenement(), {
      id: 'E-1',
      statutId: STATUT_CLOTURE,
      compteRendu: '  Réparé  ',
      dateCloture: '2026-11-25',
      clotureBy: 'U-1',
    })
    expect(appels(0)[0]).toEqual([
      'update',
      {
        statut_evenement_id: STATUT_CLOTURE,
        compte_rendu: 'Réparé',
        date_cloture: '2026-11-25',
        cloture_by: 'U-1',
        verrouille: true,
      },
    ])
  })

  it('clôture sans compte-rendu ni date : null partout, verrouillée quand même', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E-1' }] })
    await jouer(() => useChangeStatutEvenement(), {
      id: 'E-1',
      statutId: STATUT_CLOTURE,
      compteRendu: '   ',
    })
    expect(appels(0)[0]).toEqual([
      'update',
      {
        statut_evenement_id: STATUT_CLOTURE,
        compte_rendu: null,
        date_cloture: null,
        cloture_by: null,
        verrouille: true,
      },
    ])
  })

  it('réouverture : clôture effacée même si des valeurs sont fournies, déverrouillée', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E-1' }] })
    const { invalidations } = await jouer(() => useChangeStatutEvenement(), {
      id: 'E-1',
      statutId: STATUT_CLOTURE + 1,
      compteRendu: 'x',
      dateCloture: '2026-11-25',
      clotureBy: 'U-1',
    })
    expect(appels(0)[0]).toEqual([
      'update',
      {
        statut_evenement_id: STATUT_CLOTURE + 1,
        compte_rendu: null,
        date_cloture: null,
        cloture_by: null,
        verrouille: false,
      },
    ])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.all(),
    })
  })
})

describe('useUpdateClotureEvenement', () => {
  it('corrige date et compte-rendu (vide → null) sans toucher au statut', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E-1' }] })
    await jouer(() => useUpdateClotureEvenement(), {
      id: 'E-1',
      dateCloture: '2026-11-24',
      compteRendu: '  ',
    })
    expect(appels(0)[0]).toEqual([
      'update',
      { date_cloture: '2026-11-24', compte_rendu: null },
    ])
  })
})

describe('useToggleVerrouEvenement', () => {
  it('écrit le seul champ verrouille', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: 'E-1' }] })
    const { invalidations } = await jouer(() => useToggleVerrouEvenement(), {
      id: 'E-1',
      verrouille: false,
    })
    expect(appels(0)[0]).toEqual(['update', { verrouille: false }])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: evenementsQueries.all(),
    })
  })
})
