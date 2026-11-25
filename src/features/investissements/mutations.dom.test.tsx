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
import { investissementsQueries } from './queries'
import {
  useChangeStatutCapex,
  useCreateInvestissement,
  useCreerDevis,
  useDeleteInvestissement,
  useModifierDateValidation,
  useModifierDevis,
  useRetenirDevis,
  useSupprimerDevis,
  useUpdateInvestissement,
} from './mutations'

/**
 * Écritures des investissements (l'argent du site) : pour chaque hook, ce qui
 * part vers la base (table ou RPC, valeurs), ce qui est invalidé, et ce qui se
 * passe quand la base refuse (42501 : hors périmètre). Les tests décrivent le
 * comportement ACTUEL ; un écart jugé fautif est épinglé en `it.fails`.
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))

const SITE = '11111111-1111-1111-1111-111111111111'
const AUTEUR = '22222222-2222-2222-2222-222222222222'
const PROJET = '33333333-3333-3333-3333-333333333333'
const DEVIS = '44444444-4444-4444-4444-444444444444'
const DEVIS_2 = '55555555-5555-5555-5555-555555555555'
const DOC = '66666666-6666-6666-6666-666666666666'
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

/** Appels chaînés de la n-ième requête (0-indexée). */
function appels(n: number) {
  return enr.courant!.requetes[n]!.appels
}

const projet = {
  libelle: '  Toiture  ',
  description: '   ',
  date_demande: '2026-11-20',
  annee_budget: '2027',
}
const devisValeurs = {
  fournisseur: '  Couvreur SA ',
  objet: ' ',
  montant_ht: '1234,5',
}

/** Monte un hook, lance la mutation, attend la fin (succès ou échec). */
async function jouer<V>(
  utiliser: () => {
    mutate: (v: V) => void
    isSuccess: boolean
    isError: boolean
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

describe('useCreateInvestissement', () => {
  it('INSERT nettoyé (libellé trim, description vide → null, année en nombre) + site et auteur, puis invalidation', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: PROJET }] })
    const { result, invalidations } = await jouer(
      () => useCreateInvestissement(),
      { siteId: SITE, createdBy: AUTEUR, values: projet },
    )
    expect(sequence(enr.courant)).toEqual(['from:investissements insert'])
    expect(appels(0)[0]).toEqual([
      'insert',
      {
        libelle: 'Toiture',
        description: null,
        date_demande: '2026-11-20',
        annee_budget: 2027,
        site_id: SITE,
        created_by: AUTEUR,
      },
    ])
    expect(result.current.isSuccess).toBe(true)
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: investissementsQueries.all(),
    })
  })

  it('refus 42501 : l’erreur remonte telle quelle, rien n’est invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { result, invalidations } = await jouer(
      () => useCreateInvestissement(),
      { siteId: SITE, createdBy: AUTEUR, values: projet },
      'echec',
    )
    expect(result.current.error).toMatchObject({ code: '42501' })
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useUpdateInvestissement', () => {
  it('UPDATE ciblé sur l’id, sans toucher à date_cloture par défaut', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: PROJET }] })
    const { invalidations } = await jouer(() => useUpdateInvestissement(), {
      id: PROJET,
      values: projet,
    })
    expect(sequence(enr.courant)).toEqual(['from:investissements update'])
    expect(appels(0)[0]).toEqual([
      'update',
      {
        libelle: 'Toiture',
        description: null,
        date_demande: '2026-11-20',
        annee_budget: 2027,
      },
    ])
    expect(appels(0)).toContainEqual(['eq', 'id', PROJET])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: investissementsQueries.all(),
    })
  })

  it('oublierRealisation : efface date_cloture dans la même écriture', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: PROJET }] })
    await jouer(() => useUpdateInvestissement(), {
      id: PROJET,
      values: projet,
      oublierRealisation: true,
    })
    expect(appels(0)[0]).toMatchObject(['update', { date_cloture: null }])
  })

  it('échec : rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { invalidations } = await jouer(
      () => useUpdateInvestissement(),
      { id: PROJET, values: projet },
      'echec',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useChangeStatutCapex', () => {
  it('sans devis : un seul UPDATE, seuls les champs passés sont écrits (bilan et motif nettoyés)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: PROJET }] })
    const { invalidations } = await jouer(() => useChangeStatutCapex(), {
      id: PROJET,
      statutId: 4,
      annee: 2027,
      bilan: '   ',
      motifArret: '  Trop cher ',
      refusNiveau: 2 as const,
    })
    expect(sequence(enr.courant)).toEqual(['from:investissements update'])
    expect(appels(0)[0]).toEqual([
      'update',
      {
        statut_capex_id: 4,
        annee_budget: 2027,
        bilan: null,
        motif_arret: 'Trop cher',
        refus_niveau: 2,
      },
    ])
    expect(invalidations).toHaveBeenCalledTimes(1)
  })

  it('avec devis retenus : RPC poser_devis_retenus D’ABORD, puis le statut', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null, { id: PROJET }] })
    await jouer(() => useChangeStatutCapex(), {
      id: PROJET,
      statutId: 2,
      annee: 2027,
      dateValidation: '2026-11-25',
      devisRetenus: [DEVIS, DEVIS_2],
    })
    expect(sequence(enr.courant)).toEqual([
      'rpc:poser_devis_retenus args',
      'from:investissements update',
    ])
    expect(appels(0)[0]).toEqual([
      'args',
      { p_projet_id: PROJET, p_retenus: [DEVIS, DEVIS_2] },
    ])
    expect(appels(1)[0]).toEqual([
      'update',
      { statut_capex_id: 2, annee_budget: 2027, date_validation: '2026-11-25' },
    ])
  })

  it('devis retenus = [] : la RPC part quand même (tout décocher)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null, { id: PROJET }] })
    await jouer(() => useChangeStatutCapex(), {
      id: PROJET,
      statutId: 1,
      annee: 2027,
      devisRetenus: [],
    })
    expect(appels(0)[0]).toEqual([
      'args',
      { p_projet_id: PROJET, p_retenus: [] },
    ])
  })

  it('la RPC échoue : le statut n’est pas écrit, rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { result, invalidations } = await jouer(
      () => useChangeStatutCapex(),
      { id: PROJET, statutId: 2, annee: 2027, devisRetenus: [DEVIS] },
      'echec',
    )
    expect(sequence(enr.courant)).toEqual(['rpc:poser_devis_retenus args'])
    expect(result.current.error).toMatchObject({ code: '42501' })
    expect(invalidations).not.toHaveBeenCalled()
  })

  it('le statut échoue APRÈS la pose des devis : l’erreur remonte (2 requêtes parties)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null], echecA: 2 })
    const { result } = await jouer(
      () => useChangeStatutCapex(),
      { id: PROJET, statutId: 2, annee: 2027, devisRetenus: [DEVIS] },
      'echec',
    )
    expect(sequence(enr.courant)).toEqual([
      'rpc:poser_devis_retenus args',
      'from:investissements update',
    ])
    expect(result.current.isError).toBe(true)
  })

  it.fails(
    'BUG CANDIDAT : le statut échoue après la pose des devis — la base a changé (devis retenus) mais le cache n’est pas invalidé, l’écran garde l’ancien choix',
    async () => {
      enr.courant = nouvelEnregistreur({ reponses: [null], echecA: 2 })
      const { invalidations } = await jouer(
        () => useChangeStatutCapex(),
        { id: PROJET, statutId: 2, annee: 2027, devisRetenus: [DEVIS] },
        'echec',
      )
      expect(invalidations).toHaveBeenCalledWith({
        queryKey: investissementsQueries.all(),
      })
    },
  )
})

describe('useDeleteInvestissement', () => {
  it('DELETE ciblé avec .single() (0 ligne = erreur), puis invalidation', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: PROJET }] })
    const { invalidations } = await jouer(
      () => useDeleteInvestissement(),
      PROJET,
    )
    expect(sequence(enr.courant)).toEqual(['from:investissements delete'])
    expect(appels(0)).toContainEqual(['eq', 'id', PROJET])
    expect(appels(0)).toContainEqual(['single'])
    expect(invalidations).toHaveBeenCalledTimes(1)
  })

  it('échec (PGRST116 : rien supprimé) : rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({
      echecA: 1,
      erreur: { message: '0 ligne', code: 'PGRST116' },
    })
    const { invalidations } = await jouer(
      () => useDeleteInvestissement(),
      PROJET,
      'echec',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useModifierDateValidation', () => {
  it.each([
    ['prevalidation', { date_prevalidation: '2026-10-01' }],
    ['validation', { date_validation: '2026-10-01' }],
  ] as const)(
    'niveau %s : n’écrit QUE la date de ce niveau',
    async (niveau, attendu) => {
      enr.courant = nouvelEnregistreur({ reponses: [{ id: PROJET }] })
      const { invalidations } = await jouer(() => useModifierDateValidation(), {
        id: PROJET,
        niveau,
        date: '2026-10-01',
      })
      expect(sequence(enr.courant)).toEqual(['from:investissements update'])
      expect(appels(0)[0]).toEqual(['update', attendu])
      expect(appels(0)).toContainEqual(['eq', 'id', PROJET])
      expect(invalidations).toHaveBeenCalledTimes(1)
    },
  )

  it('échec : rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { invalidations } = await jouer(
      () => useModifierDateValidation(),
      { id: PROJET, niveau: 'validation' as const, date: '2026-10-01' },
      'echec',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useCreerDevis', () => {
  it('INSERT sur investissements_devis : fournisseur trim, objet vide → null, montant « 1234,5 » → 1234.5', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DEVIS }] })
    const { invalidations } = await jouer(() => useCreerDevis(), {
      projetId: PROJET,
      values: devisValeurs,
      documentId: DOC,
    })
    expect(sequence(enr.courant)).toEqual(['from:investissements_devis insert'])
    expect(appels(0)[0]).toEqual([
      'insert',
      {
        fournisseur: 'Couvreur SA',
        objet: null,
        montant_ht: 1234.5,
        investissement_id: PROJET,
        document_id: DOC,
      },
    ])
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: investissementsQueries.all(),
    })
  })

  it('montant vide : envoyé à 0 (le schéma le refuse en amont)', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DEVIS }] })
    await jouer(() => useCreerDevis(), {
      projetId: PROJET,
      values: { ...devisValeurs, montant_ht: '  ' },
      documentId: null,
    })
    expect(appels(0)[0]).toMatchObject([
      'insert',
      { montant_ht: 0, document_id: null },
    ])
  })

  it('refus 42501 : erreur remontée, rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { result, invalidations } = await jouer(
      () => useCreerDevis(),
      { projetId: PROJET, values: devisValeurs, documentId: null },
      'echec',
    )
    expect(result.current.error).toMatchObject({ code: '42501' })
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useModifierDevis', () => {
  it('documentId absent : le PDF n’est pas touché', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DEVIS }] })
    const { invalidations } = await jouer(() => useModifierDevis(), {
      id: DEVIS,
      values: devisValeurs,
    })
    expect(sequence(enr.courant)).toEqual(['from:investissements_devis update'])
    expect(appels(0)[0]).toEqual([
      'update',
      { fournisseur: 'Couvreur SA', objet: null, montant_ht: 1234.5 },
    ])
    expect(appels(0)).toContainEqual(['eq', 'id', DEVIS])
    expect(invalidations).toHaveBeenCalledTimes(1)
  })

  it('documentId null : le PDF est détaché explicitement', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DEVIS }] })
    await jouer(() => useModifierDevis(), {
      id: DEVIS,
      values: devisValeurs,
      documentId: null,
    })
    expect(appels(0)[0]).toMatchObject(['update', { document_id: null }])
  })

  it('échec : rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { invalidations } = await jouer(
      () => useModifierDevis(),
      { id: DEVIS, values: devisValeurs },
      'echec',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useRetenirDevis', () => {
  it.each([true, false])(
    'retenu = %s : UPDATE d’UN devis, puis invalidation',
    async (retenu) => {
      enr.courant = nouvelEnregistreur({ reponses: [{ id: DEVIS }] })
      const { invalidations } = await jouer(() => useRetenirDevis(), {
        id: DEVIS,
        retenu,
      })
      expect(appels(0)[0]).toEqual(['update', { retenu }])
      expect(appels(0)).toContainEqual(['eq', 'id', DEVIS])
      expect(invalidations).toHaveBeenCalledTimes(1)
    },
  )

  it('échec : rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { invalidations } = await jouer(
      () => useRetenirDevis(),
      { id: DEVIS, retenu: true },
      'echec',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })
})

describe('useSupprimerDevis', () => {
  it('DELETE ciblé sur le devis (le PDF reste), puis invalidation', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [{ id: DEVIS }] })
    const { invalidations } = await jouer(() => useSupprimerDevis(), DEVIS)
    expect(sequence(enr.courant)).toEqual(['from:investissements_devis delete'])
    expect(appels(0)).toContainEqual(['eq', 'id', DEVIS])
    expect(invalidations).toHaveBeenCalledTimes(1)
  })

  it('échec : rien d’invalidé', async () => {
    enr.courant = nouvelEnregistreur({ echecA: 1, erreur: REFUS })
    const { invalidations } = await jouer(
      () => useSupprimerDevis(),
      DEVIS,
      'echec',
    )
    expect(invalidations).not.toHaveBeenCalled()
  })
})
