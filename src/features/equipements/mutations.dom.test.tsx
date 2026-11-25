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
import type { Champ } from '@/lib/champs'
import { useUpdateParcSousCategorieChamps } from './mutations'

/**
 * Propagation du gabarit d'une sous-catégorie de parc : depuis 178, gabarit et
 * valeurs fusionnées des équipements partent en UN appel RPC transactionnel
 * (propager_gabarit_sous_categorie) — avant, une écriture par table, et un échec
 * au milieu laissait une propagation partielle.
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const champs = [
  { cle: 'puissance', libelle: 'Puissance', type: 'texte', defaut: '5 kW' },
] as unknown as Champ[]

describe('useUpdateParcSousCategorieChamps — propagation atomique (178)', () => {
  it('un seul appel RPC : gabarit + valeurs fusionnées de chaque équipement', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null] })
    const { result } = renderHook(() => useUpdateParcSousCategorieChamps(), {
      wrapper,
    })
    result.current.mutate({
      id: 'CAT',
      champs,
      equipements: [{ id: 'E1', specifications: null }],
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(sequence(enr.courant)).toEqual([
      'rpc:propager_gabarit_sous_categorie args',
    ])
    const args = enr.courant.requetes[0]!.appels[0]![1] as {
      p_categorie_id: string
      p_equipements: { id: string }[]
    }
    expect(args.p_categorie_id).toBe('CAT')
    expect(args.p_equipements.map((e) => e.id)).toEqual(['E1'])
  })

  it('gabarit trop lourd : refus AVANT tout appel', async () => {
    enr.courant = nouvelEnregistreur({ reponses: [null] })
    const { result } = renderHook(() => useUpdateParcSousCategorieChamps(), {
      wrapper,
    })
    const enorme = [
      { cle: 'x', libelle: 'x'.repeat(9500), type: 'texte' },
    ] as unknown as Champ[]
    result.current.mutate({
      id: 'CAT',
      champs: enorme,
      equipements: [{ id: 'E1', specifications: null }],
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(sequence(enr.courant)).toEqual([])
  })
})
