import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  clientEnregistreur,
  nouvelEnregistreur,
  sequence,
  type Enregistreur,
} from '@/test/supabase-enregistreur'
import { segOfUnique } from '@/lib/slug'
import { ConvertirEnEvenementDialog } from './convertir-en-evenement-dialog'

/**
 * Confirmation « Convertir en Événement ? » (liste Travaux) : conversion par
 * RPC, relecture de la liste des événements pour calculer le slug, puis
 * redirection vers la fiche créée. En échec : toast d'erreur, la boîte reste
 * ouverte. Comportement ACTUEL.
 */
const enr = vi.hoisted(() => ({ courant: null as Enregistreur | null }))
vi.mock('@/lib/supabase', () => ({ supabase: clientEnregistreur(enr) }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const SITE = 'S-1'
const TRAVAUX = { id: 'T-1', titre: 'Fuite chaufferie' }

function monter(aConvertir: { id: string; titre: string } | null = TRAVAUX) {
  toast.success.mockReset()
  toast.error.mockReset()
  const fermer = vi.fn()
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Hote() {
    const [cible, setCible] = useState(aConvertir)
    return (
      <ConvertirEnEvenementDialog
        siteId={SITE}
        aConvertir={cible}
        onFermer={() => {
          fermer()
          setCible(null)
        }}
      />
    )
  }
  const racine = createRootRoute({ component: () => <Outlet /> })
  const liste = createRoute({
    getParentRoute: () => racine,
    path: '/',
    component: Hote,
  })
  const fiche = createRoute({
    getParentRoute: () => racine,
    path: '/evenements/$evenement',
    component: () => <p>Fiche événement</p>,
  })
  const router = createRouter({
    routeTree: racine.addChildren([liste, fiche]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, fermer }
}

describe('ConvertirEnEvenementDialog', () => {
  it('fermé quand rien n’est à convertir', async () => {
    enr.courant = nouvelEnregistreur()
    monter(null)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(enr.courant.requetes).toHaveLength(0)
  })

  it('ouvert : titre, description reprenant le titre du travaux', async () => {
    enr.courant = nouvelEnregistreur()
    monter()
    expect(
      await screen.findByText('Convertir en Événement ?'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/« Fuite chaufferie » sera supprimé et remplacé/),
    ).toBeInTheDocument()
  })

  it('convertir : RPC puis relecture de la liste du site, fermeture, toast, redirection vers le slug calculé sur la liste fraîche', async () => {
    const evenements = [
      { id: 'E-NOUVEAU', titre: 'Fuite chaufferie' },
      { id: 'E-ANCIEN', titre: 'Fuite chaufferie' },
    ]
    enr.courant = nouvelEnregistreur({ reponses: ['E-NOUVEAU', evenements] })
    const { router, fermer } = monter()
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Convertir' }))
    await screen.findByText('Fiche événement')
    expect(sequence(enr.courant)).toEqual([
      'rpc:convertir_travaux_en_evenement args',
      'from:evenements select',
    ])
    expect(enr.courant.requetes[1]!.appels).toContainEqual([
      'eq',
      'site_id',
      SITE,
    ])
    expect(fermer).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Converti en Événement')
    const attendu = segOfUnique(
      { nom: 'Fuite chaufferie', id: 'E-NOUVEAU' },
      evenements.map((e) => ({ nom: e.titre, id: e.id })),
    )
    expect(router.state.location.pathname).toBe(
      `/evenements/${encodeURIComponent(attendu)}`,
    )
  })

  it('refus de la base : toast d’erreur traduit, pas de fermeture ni de redirection', async () => {
    enr.courant = nouvelEnregistreur({
      echecA: 1,
      erreur: { message: 'rls', code: '42501' },
    })
    const { router, fermer } = monter()
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Convertir' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Action impossible : élément hors de votre périmètre, ou déjà modifié.',
      ),
    )
    expect(fermer).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('button', { name: 'Convertir' })).toBeEnabled()
  })

  it('conversion faite mais relecture de la liste en échec : déjà fermé et toast de succès, PUIS toast d’erreur, pas de redirection', async () => {
    enr.courant = nouvelEnregistreur({ reponses: ['E-NOUVEAU'], echecA: 2 })
    const { router, fermer } = monter()
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Convertir' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(fermer).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Converti en Événement')
    expect(router.state.location.pathname).toBe('/')
  })

  it('Annuler : ferme sans rien écrire', async () => {
    enr.courant = nouvelEnregistreur()
    const { fermer } = monter()
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Annuler' }))
    expect(fermer).toHaveBeenCalledTimes(1)
    expect(enr.courant.requetes).toHaveLength(0)
  })
})
