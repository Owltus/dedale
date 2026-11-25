import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
import { relevesQueries } from '@/features/releves/queries'
import type { GammeReleveResume } from '@/features/releves/pipeline'
import { segOfUnique } from '@/lib/slug'
import { RelevesListe } from './releves-liste'

/**
 * Page liste des Relevés : une ligne par gamme ayant au moins un relevé
 * (vignette, nombre de types, d'OT, dernier relevé), recherche insensible aux
 * accents, état vide, et navigation vers la fiche par slug. Le résumé est
 * pré-chargé dans le cache (aucun appel réseau). Comportement ACTUEL.
 */
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const miniatures = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/features/miniatures/use-miniature-urls', () => ({
  useMiniatureUrls: () => ({
    urlOf: (id: string | null) => (id ? `https://img.test/${id}` : null),
    refresh: miniatures.refresh,
  }),
}))

const SITE = 'S-1'

const gamme = (
  p: Partial<GammeReleveResume> & { id: string; nomGamme: string },
): GammeReleveResume => ({
  nbTypes: 1,
  nbOt: 1,
  dernierReleve: null,
  miniatureId: null,
  ...p,
})

function monter(gammes: GammeReleveResume[]) {
  const qc = new QueryClient()
  qc.setQueryData(relevesQueries.gammesListe(SITE).queryKey, gammes)
  const racine = createRootRoute({ component: () => <Outlet /> })
  const liste = createRoute({
    getParentRoute: () => racine,
    path: '/releves',
    component: () => <RelevesListe siteId={SITE} />,
  })
  const fiche = createRoute({
    getParentRoute: () => racine,
    path: '/releves/$releve',
    component: () => <p>Fiche relevé</p>,
  })
  const router = createRouter({
    routeTree: racine.addChildren([liste, fiche]),
    history: createMemoryHistory({ initialEntries: ['/releves'] }),
  })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const GAMMES = [
  gamme({
    id: 'G1',
    nomGamme: 'Légionelle ECS',
    nbTypes: 3,
    nbOt: 12,
    dernierReleve: '2026-11-20',
    miniatureId: 'M1',
  }),
  gamme({ id: 'G2', nomGamme: 'Compteurs eau', nbTypes: 1, nbOt: 1 }),
]

describe('RelevesListe', () => {
  it('aucune gamme : état vide explicite', async () => {
    monter([])
    expect(await screen.findByText('Aucun relevé')).toBeInTheDocument()
  })

  it('une ligne par gamme : titre, pluriel des types, nombre d’OT, dernier relevé, vignette', async () => {
    monter(GAMMES)
    expect(await screen.findByText('Légionelle ECS')).toBeInTheDocument()
    expect(screen.getByText('3 types de relevé')).toBeInTheDocument()
    expect(screen.getByText('1 type de relevé')).toBeInTheDocument()
    expect(screen.getAllByText('12 OT').length).toBeGreaterThan(0)
    expect(screen.getByText(/^Dernier relevé : /)).toBeInTheDocument()
    expect(
      document.querySelector('img[src="https://img.test/M1"]'),
    ).not.toBeNull()
  })

  it('recherche insensible aux accents et à la casse ; aucune correspondance → message dédié', async () => {
    monter(GAMMES)
    const u = userEvent.setup()
    const champ = await screen.findByPlaceholderText('Rechercher une gamme…')
    await u.type(champ, 'LEGIONELLE')
    expect(screen.getByText('Légionelle ECS')).toBeInTheDocument()
    expect(screen.queryByText('Compteurs eau')).not.toBeInTheDocument()
    await u.clear(champ)
    await u.type(champ, 'zzz')
    expect(
      screen.getByText('Aucune gamme ne correspond à cette recherche.'),
    ).toBeInTheDocument()
  })

  it('clic sur une gamme : navigation vers la fiche par slug calculé sur TOUTES les gammes', async () => {
    const homonymes = [
      gamme({ id: 'G1', nomGamme: 'Chaufferie' }),
      gamme({ id: 'G2', nomGamme: 'Chaufferie' }),
    ]
    const router = monter(homonymes)
    const lignes = await screen.findAllByRole('button', { name: 'Chaufferie' })
    await userEvent.setup().click(lignes[1]!)
    await screen.findByText('Fiche relevé')
    const sibs = homonymes.map((g) => ({ nom: g.nomGamme, id: g.id }))
    const attendu = segOfUnique({ nom: 'Chaufferie', id: 'G2' }, sibs)
    expect(router.state.location.pathname).toBe(
      `/releves/${encodeURIComponent(attendu)}`,
    )
  })
})
