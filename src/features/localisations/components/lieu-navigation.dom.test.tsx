import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { currentRoleQueryOptions } from '@/features/utilisateurs/queries'
import { segOfUnique } from '@/lib/slug'
import type { Tables } from '@/lib/database.types'
import { localisationsQueries, type LieuDetail } from '../queries'
import { LocalisationsExplorer } from './localisations-explorer'
import { LienLieu } from './lien-lieu'

/**
 * Adresse d'un lieu DANS l'arbre : `/localisations/<bâtiment>/<niveau>/<lieu>`.
 * Clic sur une ligne de lieu, rechargement direct de l'adresse, homonymes, et
 * brique `LienLieu` (lien vers la MÊME adresse, repli texte). Toutes les
 * lectures sont pré-chargées dans le cache : aucun appel réseau.
 */
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/features/miniatures/use-miniature-urls', () => ({
  useMiniatureUrls: () => ({ urlOf: () => null, refresh: vi.fn() }),
}))
// Modales de saisie : jamais ouvertes par un `lecteur`. Remplacées pour ne pas
// charger tout l'outillage de miniatures (champ, recadrage…) qu'elles tirent.
vi.mock('./batiment-form-dialog', () => ({ BatimentFormDialog: () => null }))
vi.mock('./niveau-form-dialog', () => ({ NiveauFormDialog: () => null }))
vi.mock('./local-form-dialog', () => ({ LocalFormDialog: () => null }))
vi.mock('./import-csv-dialog', () => ({ ImportCsvDialog: () => null }))

const SITE = 'site-1'
const DATE = '2026-01-01T00:00:00Z'

const batiment = (id: string, nom: string): Tables<'batiments'> => ({
  id,
  nom,
  site_id: SITE,
  description: null,
  image_path: null,
  miniature_id: null,
  created_at: DATE,
  updated_at: DATE,
})
const niveau = (id: string, nom: string): Tables<'niveaux'> => ({
  id,
  nom,
  batiment_id: 'b-1',
  ordre: 0,
  description: null,
  image_path: null,
  miniature_id: null,
  created_at: DATE,
  updated_at: DATE,
})
const local = (id: string, nom: string): Tables<'locaux'> => ({
  id,
  nom,
  niveau_id: 'n-1',
  accessible_pmr: true,
  capacite_personnes: 12,
  chauffe_climatise: false,
  description: null,
  hauteur_m: null,
  image_path: null,
  miniature_id: null,
  specifications: [],
  surface_m2: 42,
  type_local_id: null,
  created_at: DATE,
  updated_at: DATE,
})
const detail = (l: Tables<'locaux'>): LieuDetail => ({
  ...l,
  site_id: SITE,
  batiment_id: 'b-1',
  batiment_nom: 'Bâtiment A',
  niveau_nom: 'RDC',
  chemin_court: `Bâtiment A / RDC / ${l.nom}`,
  chemin_complet: `Site 1 / Bâtiment A / RDC / ${l.nom} (${l.id})`,
  type_local: 'Bureau',
})

const BATIMENTS = [batiment('b-1', 'Bâtiment A'), batiment('b-2', 'Annexe')]
const NIVEAUX = [niveau('n-1', 'RDC'), niveau('n-2', 'R+1')]

function monter(
  chemin: string,
  {
    locaux = [local('l-1', 'Hall'), local('l-2', 'Chaufferie')],
    lieux = {},
    accueil = null,
  }: {
    locaux?: Tables<'locaux'>[]
    /** Fiches de lieu visibles ; absentes = lues `null` (RLS / supprimé). */
    lieux?: Record<string, LieuDetail | null>
    accueil?: ReactNode
  } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  qc.setQueryData(currentRoleQueryOptions.queryKey, 'lecteur')
  qc.setQueryData(localisationsQueries.batiments(SITE).queryKey, BATIMENTS)
  qc.setQueryData(localisationsQueries.niveaux('b-1').queryKey, NIVEAUX)
  qc.setQueryData(localisationsQueries.locaux('n-1').queryKey, locaux)
  qc.setQueryData(localisationsQueries.typesLocaux().queryKey, [])
  qc.setQueryData(localisationsQueries.batimentsSurface(SITE).queryKey, [])
  qc.setQueryData(localisationsQueries.niveauxSurface('b-1').queryKey, [])
  for (const l of locaux) {
    qc.setQueryData(
      localisationsQueries.local(l.id).queryKey,
      l.id in lieux ? (lieux[l.id] ?? null) : detail(l),
    )
  }
  for (const [id, d] of Object.entries(lieux)) {
    qc.setQueryData(localisationsQueries.local(id).queryKey, d)
  }

  const racine = createRootRoute({ component: () => <Outlet /> })
  const app = createRoute({
    getParentRoute: () => racine,
    id: '_app',
    component: () => <Outlet />,
  })
  const localisations = createRoute({
    getParentRoute: () => app,
    path: 'localisations/$',
    component: () => <LocalisationsExplorer siteId={SITE} />,
  })
  const index = createRoute({
    getParentRoute: () => racine,
    path: '/',
    component: () => <>{accueil}</>,
  })
  const router = createRouter({
    routeTree: racine.addChildren([index, app.addChildren([localisations])]),
    history: createMemoryHistory({ initialEntries: [chemin] }),
  })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('Arbre des localisations — 3ᵉ palier (lieu)', () => {
  it('clic sur une ligne de lieu : adresse slug du lieu et fiche ouverte', async () => {
    const router = monter('/localisations/batiment-a/rdc')
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Chaufferie' }))
    expect(await screen.findByText('Chemin')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(
      '/localisations/batiment-a/rdc/chaufferie',
    )
    expect(
      screen.getByText('Site 1 / Bâtiment A / RDC / Chaufferie (l-2)'),
    ).toBeInTheDocument()
    expect(screen.getByText('Bureau')).toBeInTheDocument()
    expect(screen.getByText('42 m²')).toBeInTheDocument()
    expect(screen.getByText('12 pers. · PMR')).toBeInTheDocument()
  })

  it('adresse rechargée telle quelle : la fiche se rouvre, fil d’Ariane jusqu’au niveau', async () => {
    const router = monter('/localisations/batiment-a/rdc/hall')
    expect(
      await screen.findByText('Site 1 / Bâtiment A / RDC / Hall (l-1)'),
    ).toBeInTheDocument()
    // Le niveau, ancêtre cliquable, ramène à la liste de ses lieux.
    await userEvent.setup().click(screen.getByRole('button', { name: 'RDC' }))
    expect(
      await screen.findByRole('button', { name: 'Chaufferie' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/localisations/batiment-a/rdc')
  })

  it('homonymes : chaque lieu a sa propre adresse, symétrique', async () => {
    const locaux = [
      local('aaaaaaaa-0001', 'Bureau'),
      local('bbbbbbbb-0002', 'Bureau'),
    ]
    const router = monter('/localisations/batiment-a/rdc', { locaux })
    const lignes = await screen.findAllByRole('button', { name: 'Bureau' })
    await userEvent.setup().click(lignes[1]!)
    const attendu = segOfUnique(locaux[1]!, locaux)
    expect(attendu).not.toBe('bureau')
    expect(router.state.location.pathname).toBe(
      `/localisations/batiment-a/rdc/${attendu}`,
    )
    expect(
      await screen.findByText(
        'Site 1 / Bâtiment A / RDC / Bureau (bbbbbbbb-0002)',
      ),
    ).toBeInTheDocument()
  })

  it('segment de lieu inconnu : on reste sur la liste du niveau', async () => {
    monter('/localisations/batiment-a/rdc/inexistant')
    expect(
      await screen.findByRole('button', { name: 'Hall' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Chemin')).not.toBeInTheDocument()
  })

  it('lieu masqué entre-temps (lecture null) : « Lieu introuvable »', async () => {
    monter('/localisations/batiment-a/rdc/hall', { lieux: { 'l-1': null } })
    expect(await screen.findByText('Lieu introuvable')).toBeInTheDocument()
  })
})

describe('LienLieu', () => {
  it('rend le chemin court en lien vers la MÊME adresse que l’arbre', async () => {
    const router = monter('/', {
      accueil: <LienLieu localId="l-2" texte="Chaufferie (figé)" />,
    })
    const lien = await screen.findByRole('link', {
      name: 'Bâtiment A / RDC / Chaufferie',
    })
    expect(lien).toHaveAttribute(
      'href',
      '/localisations/batiment-a/rdc/chaufferie',
    )
    await userEvent.setup().click(lien)
    expect(await screen.findByText('Chemin')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(
      '/localisations/batiment-a/rdc/chaufferie',
    )
  })

  it('lieu non visible : repli sur le texte figé, sans lien', async () => {
    monter('/', {
      lieux: { 'l-9': null },
      accueil: <LienLieu localId="l-9" texte="Ancien local" />,
    })
    expect(await screen.findByText('Ancien local')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('aucun lieu : tiret, sans lien', async () => {
    monter('/', { accueil: <LienLieu localId={null} /> })
    expect(await screen.findByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
