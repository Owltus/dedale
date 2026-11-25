import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { currentRoleQueryOptions } from '@/features/utilisateurs/queries'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DeploiementsDialog } from './deploiements-dialog'
import { EquipementsExplorer } from './equipements-explorer'

/**
 * Accès DURABLE à l'annulation d'un déploiement : liste des lots d'une flotte
 * (regroupés, datés avec la semaine ISO, du plus récent), « Annuler » → aperçu
 * rendu par la base → confirmation → `annuler_deploiement` appliqué ; et le
 * bouton « Déploiements » de la sous-catégorie selon le rôle. Faux client :
 * tables → `TABLES`, RPC → `RPC[fn](args)`.
 */
const reseau = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  from: [] as string[],
}))
const toasts = vi.hoisted(() => ({ succes: [] as string[] }))
vi.mock('sonner', () => ({
  toast: {
    success: (titre: string) => toasts.succes.push(titre),
    error: vi.fn(),
  },
}))

const categorie = (p: Record<string, unknown>) => ({
  scope: 'parc',
  site_id: 'site-1',
  parent_id: null,
  est_actif: true,
  valeur_principale: null,
  valeur_secondaire: null,
  valeur_tertiaire: null,
  modele_equipement_id: null,
  specifications: null,
  miniature_id: null,
  description: null,
  ordre: 0,
  ...p,
})
const TABLES: Record<string, unknown[]> = {
  categories: [
    categorie({ id: 'r', nom: 'Sécurité incendie' }),
    categorie({ id: 'sc', nom: 'Détecteurs', parent_id: 'r' }),
  ],
  // Lecture des lots (table `equipements`, triée par created_at côté base).
  equipements: [
    { id: 'e1', lot_deploiement: 'LOT-A', created_at: '2026-11-02T10:00:00Z' },
    { id: 'e2', lot_deploiement: 'LOT-A', created_at: '2026-11-02T10:00:01Z' },
    { id: 'e3', lot_deploiement: 'LOT-B', created_at: '2026-11-24T10:00:00Z' },
    { id: 'e4', lot_deploiement: 'LOT-A', created_at: '2026-11-02T10:00:02Z' },
  ],
}
const RPC: Record<string, (args: Record<string, unknown>) => unknown> = {
  annuler_deploiement: (a) => ({
    lot: a.p_lot,
    total: 3,
    a_supprimer: 2,
    supprimes: a.p_appliquer === true ? 2 : 0,
    conserves: [{ id: 'e4', lieu: 'Chambre 103', raisons: ['documents'] }],
    gammes: [
      { id: 'g1', nom: 'SSI annuel', operations_retirees_ot_ouverts: 4 },
    ],
  }),
}

vi.mock('@/hooks/use-realtime-refresh', () => ({ useRealtimeRefresh: vi.fn() }))
vi.mock('@/features/miniatures/use-miniature-urls', () => ({
  useMiniatureUrls: () => ({ urlOf: () => null, refresh: vi.fn() }),
}))
// Enfants lourds de l'explorateur, hors sujet ici : remplacés par du vide
// (ne pas charger fiche, imports et dialogs de catégorie dans ce test).
vi.mock('./equipement-detail', () => ({ EquipementDetail: () => null }))
vi.mock('./import-csv-dialog', () => ({ ImportCsvDialog: () => null }))
vi.mock('./equipement-parc-dialog', () => ({
  EquipementParcDialog: () => null,
}))
vi.mock('./parc-sous-categorie-dialog', () => ({
  ParcSousCategorieDialog: () => null,
}))
vi.mock('@/features/categories/components/category-form-dialog', () => ({
  CategoryFormDialog: () => null,
}))
vi.mock(
  '@/features/categories/components/confirm-delete-categorie-dialog',
  () => ({
    ConfirmDeleteCategorieDialog: () => null,
  }),
)
vi.mock('@/features/miniatures/components/miniature-thumb', () => ({
  MiniatureThumb: () => null,
}))
// Explorateur ouvert sur la sous-catégorie « Détecteurs » (sans routeur).
vi.mock('../use-equipements-drill', () => ({
  useEquipementsDrillRoute: () => ({
    catSegs: ['securite-incendie', 'detecteurs'],
    navigateTo: () => undefined,
  }),
}))
vi.mock('@/lib/supabase', () => {
  const chaine = (repondre: () => Promise<unknown>) => {
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_c, m: string) {
          if (m === 'then') return undefined
          if (m === 'throwOnError') return repondre
          return () => proxy
        },
      },
    )
    return proxy
  }
  return {
    supabase: {
      from: (table: string) => {
        reseau.from.push(table)
        return chaine(() =>
          Promise.resolve({ data: TABLES[table] ?? [], error: null }),
        )
      },
      rpc: (fn: string, args: Record<string, unknown>) =>
        chaine(() => {
          reseau.rpc.push({ fn, args })
          return Promise.resolve({ data: RPC[fn]?.(args) ?? null, error: null })
        }),
    },
  }
})

beforeEach(() => {
  reseau.rpc = []
  reseau.from = []
  toasts.succes = []
})

function client(role = 'technicien') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(currentRoleQueryOptions.queryKey, role)
  return qc
}

function monterDialog() {
  function Hote() {
    const [open, setOpen] = useState(true)
    return (
      <DeploiementsDialog
        open={open}
        onOpenChange={setOpen}
        categorieId="sc"
        sousCategorieNom="Détecteurs"
      />
    )
  }
  render(
    <QueryClientProvider client={client()}>
      <Hote />
    </QueryClientProvider>,
  )
}

const appels = (fn: string) =>
  reseau.rpc.filter((r) => r.fn === fn).map((r) => r.args)

describe('DeploiementsDialog — lots de la flotte', () => {
  it('regroupe par lot, du plus récent, daté avec la semaine ISO', async () => {
    monterDialog()
    const liste = await screen.findByRole('list', { name: 'Déploiements' })
    const lignes = within(liste).getAllByRole('listitem')
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toHaveTextContent('24/11/2026 (48)')
    expect(lignes[0]).toHaveTextContent('1 équipement')
    expect(lignes[1]).toHaveTextContent('02/11/2026 (45)')
    expect(lignes[1]).toHaveTextContent('3 équipements')
    // La TABLE est lue, jamais la vue (qui ne porte pas lot_deploiement).
    expect(reseau.from).toContain('equipements')
    expect(reseau.from).not.toContain('v_equipements_complet')
  })

  it('Annuler → aperçu → confirmation → annuler_deploiement appliqué', async () => {
    monterDialog()
    const u = userEvent.setup()
    const liste = await screen.findByRole('list', { name: 'Déploiements' })
    const ancien = within(liste).getAllByRole('listitem')[1]
    if (!ancien) throw new Error('lot attendu')
    await u.click(within(ancien).getByRole('button', { name: 'Annuler' }))

    expect(
      await screen.findByText(
        'Supprimer les 2 équipements de ce déploiement ?',
      ),
    ).toBeInTheDocument()
    expect(appels('annuler_deploiement')).toEqual([
      { p_lot: 'LOT-A', p_appliquer: false },
    ])
    expect(
      await screen.findByText(/Chambre 103 \(documents\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(/SSI annuel \(4\)/)).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(appels('annuler_deploiement')).toHaveLength(2))
    expect(appels('annuler_deploiement')[1]).toEqual({
      p_lot: 'LOT-A',
      p_appliquer: true,
    })
    await waitFor(() =>
      expect(toasts.succes.at(-1)).toBe(
        'Déploiement annulé : 2 équipements supprimés',
      ),
    )
  })

  it('aucun lot : état vide', async () => {
    const sauve = TABLES.equipements ?? []
    TABLES.equipements = []
    try {
      monterDialog()
      expect(await screen.findByText('Aucun déploiement')).toBeInTheDocument()
    } finally {
      TABLES.equipements = sauve
    }
  })
})

describe('Explorateur, sous-catégorie — bouton « Déploiements » selon le rôle', () => {
  function monterExplorateur(role: string) {
    function Hote() {
      return (
        <TooltipProvider>
          <EquipementsExplorer
            siteId="site-1"
            gammes={{} as Parameters<typeof EquipementsExplorer>[0]['gammes']}
          />
        </TooltipProvider>
      )
    }
    const router = createRouter({
      routeTree: createRootRoute({ component: Hote }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(
      <QueryClientProvider client={client(role)}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it.each(['admin', 'manager', 'technicien'])(
    '%s : « Déploiements » ouvre la liste des lots',
    async (role) => {
      monterExplorateur(role)
      const u = userEvent.setup()
      await u.click(await screen.findByRole('button', { name: 'Déploiements' }))
      expect(
        await screen.findByRole('list', { name: 'Déploiements' }),
      ).toBeInTheDocument()
    },
  )

  it.each(['lecteur', 'demandeur'])('%s : pas de section', async (role) => {
    monterExplorateur(role)
    await screen.findAllByText('Détecteurs')
    expect(
      screen.queryByRole('button', { name: 'Déploiements' }),
    ).not.toBeInTheDocument()
    expect(reseau.from).not.toContain('equipements')
  })
})
