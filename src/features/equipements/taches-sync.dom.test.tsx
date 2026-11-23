import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useCreateEvenement,
  useUpdateEvenement,
} from '@/features/evenements/mutations'
import {
  useCreateTravaux,
  useUpdateTravaux,
} from '@/features/travaux/mutations'

/**
 * Gel du comportement (C54) : Travaux et Événements synchronisent leurs tâches
 * de la même façon — mêmes requêtes, dans le même ordre, mêmes payloads, seule
 * la table et la clé étrangère changent. Le client Supabase est remplacé par un
 * enregistreur : chaque `from(table)` ouvre une chaîne dont on note les appels.
 */
const appels = vi.hoisted(() => ({
  liste: [] as { table: string; chaine: [string, unknown[]][] }[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const entree = { table, chaine: [] as [string, unknown[]][] }
      appels.liste.push(entree)
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_cible, propriete) {
            if (propriete === 'then') return undefined
            if (propriete === 'throwOnError') {
              return () =>
                Promise.resolve({ data: { id: 'PARENT' }, error: null })
            }
            return (...args: unknown[]) => {
              entree.chaine.push([String(propriete), args])
              return builder
            }
          },
        },
      )
      return builder
    },
  },
}))

beforeEach(() => {
  appels.liste.length = 0
})

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const tachesCreation = [
  { libelle: '  Peinture ', local_id: 'L1', equipement_id: '' },
  { libelle: '', local_id: '', equipement_id: '' }, // abandonnée : ignorée
  { libelle: '', local_id: 'L2', equipement_id: 'E2' },
]

const existants = [
  { id: 'T1', libelle: 'Inchangée', local_id: 'L1', equipement_id: '' },
  { id: 'T2', libelle: 'Avant', local_id: '', equipement_id: '' },
  { id: 'T3', libelle: 'Retirée', local_id: 'L3', equipement_id: 'E3' },
]

const tachesEdition = [
  { id: 'T1', libelle: 'Inchangée', local_id: 'L1', equipement_id: '' },
  { id: 'T2', libelle: ' Après ', local_id: 'L9', equipement_id: 'E9' },
  { libelle: 'Nouvelle', local_id: '', equipement_id: '' },
  { libelle: '', local_id: '', equipement_id: '' }, // vide : ignorée
]

function attenduCreation(table: string, fk: string) {
  return {
    table,
    chaine: [
      [
        'insert',
        [
          [
            {
              [fk]: 'PARENT',
              libelle: 'Peinture',
              local_id: 'L1',
              equipement_id: null,
              ordre: 0,
              created_by: 'U',
            },
            {
              [fk]: 'PARENT',
              libelle: 'Tâche',
              local_id: 'L2',
              equipement_id: 'E2',
              ordre: 1,
              created_by: 'U',
            },
          ],
        ],
      ],
    ],
  }
}

function attenduEdition(table: string, fk: string) {
  return [
    {
      table,
      chaine: [
        ['delete', []],
        ['in', ['id', ['T3']]],
      ],
    },
    {
      table,
      chaine: [
        [
          'insert',
          [
            [
              {
                [fk]: 'P',
                libelle: 'Nouvelle',
                local_id: null,
                equipement_id: null,
                ordre: 3,
                created_by: 'U',
              },
            ],
          ],
        ],
      ],
    },
    {
      table,
      chaine: [
        ['update', [{ libelle: 'Après', local_id: 'L9', equipement_id: 'E9' }]],
        ['eq', ['id', 'T2']],
      ],
    },
  ]
}

describe('synchronisation des tâches (Travaux / Événements)', () => {
  it('création travaux : insère les tâches saisies, ordonnées', async () => {
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      createdBy: 'U',
      values: {
        titre: 'T',
        description: '',
        date_demande: '2026-01-01',
        local_id: '',
        equipement_id: '',
        taches: tachesCreation,
      },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste.slice(1)).toEqual([
      attenduCreation('travaux_taches', 'travaux_id'),
    ])
  })

  it('création événement : insère les tâches saisies, ordonnées', async () => {
    const { result } = renderHook(() => useCreateEvenement(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      createdBy: 'U',
      values: {
        titre: 'T',
        description: '',
        date_evenement: '2026-01-01',
        local_id: '',
        equipement_id: '',
        taches: tachesCreation,
      },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste.slice(1)).toEqual([
      attenduCreation('evenements_lieux', 'evenement_id'),
    ])
  })

  it('création sans tâche : aucune requête sur la table des tâches', async () => {
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      createdBy: 'U',
      values: {
        titre: 'T',
        description: '',
        date_demande: '2026-01-01',
        local_id: '',
        equipement_id: '',
        taches: [],
      },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste).toHaveLength(1)
  })

  it('édition travaux : retire, ajoute, modifie — la conservée intacte', async () => {
    const { result } = renderHook(() => useUpdateTravaux(), { wrapper })
    result.current.mutate({
      id: 'P',
      values: {
        titre: 'T',
        description: '',
        date_demande: '2026-01-01',
        local_id: '',
        equipement_id: '',
        taches: [],
      },
      taches: tachesEdition,
      createdBy: 'U',
      existants,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste[0]!.table).toBe('interventions_travaux')
    expect(appels.liste.slice(1)).toEqual(
      attenduEdition('travaux_taches', 'travaux_id'),
    )
  })

  it('édition événement : retire, ajoute, modifie — la conservée intacte', async () => {
    const { result } = renderHook(() => useUpdateEvenement(), { wrapper })
    result.current.mutate({
      id: 'P',
      values: {
        titre: 'T',
        description: '',
        date_evenement: '2026-01-01',
        local_id: '',
        equipement_id: '',
        taches: [],
      },
      taches: tachesEdition,
      createdBy: 'U',
      existants,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste[0]!.table).toBe('evenements')
    expect(appels.liste.slice(1)).toEqual(
      attenduEdition('evenements_lieux', 'evenement_id'),
    )
  })

  it('édition sans tâches fournies : seul le parent est mis à jour', async () => {
    const { result } = renderHook(() => useUpdateEvenement(), { wrapper })
    result.current.mutate({
      id: 'P',
      values: {
        titre: 'T',
        description: '',
        date_evenement: '2026-01-01',
        local_id: '',
        equipement_id: '',
        taches: [],
      },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste).toHaveLength(1)
  })
})
