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
 * de la même façon — même diff, mêmes payloads ; seule la RPC change
 * (enregistrer_travaux / enregistrer_evenement, 175-176, une transaction). Le
 * client Supabase est remplacé par un enregistreur des appels `rpc`.
 */
const appels = vi.hoisted(() => ({
  liste: [] as { fonction: string; args: Record<string, unknown> }[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc(fonction: string, args: Record<string, unknown>) {
      appels.liste.push({ fonction, args })
      return {
        throwOnError: () =>
          Promise.resolve({ data: { id: 'PARENT' }, error: null }),
      }
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

const attenduCreation = {
  ajouter: [
    { libelle: 'Peinture', local_id: 'L1', equipement_id: null, ordre: 0 },
    { libelle: 'Tâche', local_id: 'L2', equipement_id: 'E2', ordre: 1 },
  ],
}

// T3 retirée ; « Nouvelle » ajoutée APRÈS les existants (ordre 3) ; T2
// modifiée (libellé nettoyé) ; T1 inchangée → absente du diff, statut intact.
const attenduEdition = {
  supprimer: ['T3'],
  ajouter: [
    { libelle: 'Nouvelle', local_id: null, equipement_id: null, ordre: 3 },
  ],
  modifier: [
    { id: 'T2', libelle: 'Après', local_id: 'L9', equipement_id: 'E9' },
  ],
}

const ficheTravaux = {
  titre: 'T',
  description: '',
  date_demande: '2026-01-01',
  local_id: '',
  equipement_id: '',
}
const ficheEvenement = {
  titre: 'T',
  description: '',
  date_evenement: '2026-01-01',
  local_id: '',
  equipement_id: '',
}

describe('synchronisation des tâches (Travaux / Événements)', () => {
  it('création travaux : un appel, tâches saisies ordonnées', async () => {
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      values: { ...ficheTravaux, taches: tachesCreation },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste).toEqual([
      {
        fonction: 'enregistrer_travaux',
        args: {
          p_site_id: 'S',
          p_fiche: {
            titre: 'T',
            description: null,
            date_demande: '2026-01-01',
            local_id: null,
            equipement_id: null,
          },
          p_taches: attenduCreation,
        },
      },
    ])
  })

  it('création événement : même diff, autre RPC', async () => {
    const { result } = renderHook(() => useCreateEvenement(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      values: { ...ficheEvenement, taches: tachesCreation },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste).toHaveLength(1)
    expect(appels.liste[0]!.fonction).toBe('enregistrer_evenement')
    expect(appels.liste[0]!.args.p_taches).toEqual(attenduCreation)
  })

  it('création sans tâche : liste d’ajouts vide', async () => {
    const { result } = renderHook(() => useCreateTravaux(), { wrapper })
    result.current.mutate({
      siteId: 'S',
      values: { ...ficheTravaux, taches: [] },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste[0]!.args.p_taches).toEqual({ ajouter: [] })
  })

  it('édition travaux : retire, ajoute, modifie — la conservée absente du diff', async () => {
    const { result } = renderHook(() => useUpdateTravaux(), { wrapper })
    result.current.mutate({
      id: 'P',
      values: { ...ficheTravaux, taches: [] },
      taches: tachesEdition,
      createdBy: 'U',
      existants,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste).toHaveLength(1)
    expect(appels.liste[0]!.fonction).toBe('enregistrer_travaux')
    expect(appels.liste[0]!.args.p_id).toBe('P')
    expect(appels.liste[0]!.args.p_taches).toEqual(attenduEdition)
  })

  it('édition événement : même diff', async () => {
    const { result } = renderHook(() => useUpdateEvenement(), { wrapper })
    result.current.mutate({
      id: 'P',
      values: { ...ficheEvenement, taches: [] },
      taches: tachesEdition,
      createdBy: 'U',
      existants,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste[0]!.fonction).toBe('enregistrer_evenement')
    expect(appels.liste[0]!.args.p_taches).toEqual(attenduEdition)
  })

  it('édition sans tâches fournies : p_taches absent (tâches intouchées)', async () => {
    const { result } = renderHook(() => useUpdateEvenement(), { wrapper })
    result.current.mutate({
      id: 'P',
      values: { ...ficheEvenement, taches: [] },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(appels.liste).toHaveLength(1)
    expect(appels.liste[0]!.args.p_taches).toBeUndefined()
  })
})
