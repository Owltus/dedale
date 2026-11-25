import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
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
import {
  TabActionContext,
  type TabActionApi,
  type TabAddConfig,
} from '@/components/common/tab-actions'

import { localisationsQueries, type LieuDetail } from '../queries'
import type { CompteursLieu, OngletsDuLieu } from '../fiche-lieu'
import { LieuFiche } from './lieu-fiche'
import { LieuOngletEquipements } from '@/features/equipements/components/lieu-onglet-equipements'
import { LieuOngletGammes } from '@/features/gammes/components/lieu-onglet-gammes'
import { LieuOngletOt } from '@/features/ordres-travail/components/lieu-onglet-ot'
import { LieuOngletDemandes } from '@/features/demandes/components/lieu-onglet-demandes'
import { LieuOngletTravaux } from '@/features/travaux/components/lieu-onglet-travaux'
import { LieuOngletEvenements } from '@/features/evenements/components/lieu-onglet-evenements'

/**
 * Fiche d'un lieu : onglets selon le rôle (compteur `null` → onglet masqué),
 * pastilles, lecture de CHAQUE onglet par la bonne RPC avec le bon lieu et la
 * pagination, états vides en français, bouton + selon le rôle.
 *
 * Faux client : chaque requête est notée (cible + arguments) et répond par
 * `REPONSES[cible]` (tableau vide sinon). `throwOnError` « envoie ».
 */
interface Reseau {
  appels: { cible: string; args: unknown }[]
  reponses: Partial<Record<string, unknown>>
}
const reseau = vi.hoisted((): Reseau => ({ appels: [], reponses: {} }))
vi.mock('@/lib/supabase', () => {
  const chaine = (cible: string, args: unknown) => {
    reseau.appels.push({ cible, args })
    let envoye = false
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_c, m: string) {
          if (m === 'then') {
            if (!envoye) return undefined
            const data = reseau.reponses[cible] ?? []
            return (ok: (v: unknown) => unknown) => ok({ data, error: null })
          }
          if (m === 'throwOnError') envoye = true
          return () => proxy
        },
      },
    )
    return proxy
  }
  return {
    supabase: {
      from: (table: string) => chaine(`from:${table}`, null),
      rpc: (fn: string, args: unknown) => chaine(`rpc:${fn}`, args),
    },
  }
})
vi.mock('@/hooks/use-realtime-refresh', () => ({ useRealtimeRefresh: vi.fn() }))
vi.mock('@/features/miniatures/use-miniature-urls', () => ({
  useMiniatureUrls: () => ({ urlOf: () => null, refresh: vi.fn() }),
}))
// Modales de création et envoi de documents : leur propre outillage (session,
// site actif) est hors sujet ; on vérifie ici qu'elles sont proposées.
vi.mock('@/features/demandes/components/di-form-dialog', () => ({
  DiFormDialog: () => null,
}))
vi.mock('@/features/travaux/components/travaux-form-dialog', () => ({
  TravauxFormDialog: () => null,
}))
vi.mock('@/features/evenements/components/evenement-form-dialog', () => ({
  EvenementFormDialog: () => null,
}))
vi.mock('@/features/documents/components/documents-tab', () => ({
  DocumentsTab: (p: {
    liaison: string
    parentColumn: string
    parentId: string
  }) => (
    <p>
      Documents {p.liaison} {p.parentColumn} {p.parentId}
    </p>
  ),
}))

const LIEU = 'l-1'
const SITE = 'site-1'
const DATE = '2026-01-01T00:00:00Z'

const ONGLETS: OngletsDuLieu = {
  Equipements: LieuOngletEquipements,
  Gammes: LieuOngletGammes,
  Ot: LieuOngletOt,
  Demandes: LieuOngletDemandes,
  Travaux: LieuOngletTravaux,
  Evenements: LieuOngletEvenements,
}

const detail: LieuDetail = {
  id: LIEU,
  nom: 'Chambre 214',
  niveau_id: 'n-1',
  accessible_pmr: false,
  capacite_personnes: null,
  chauffe_climatise: false,
  description: null,
  hauteur_m: null,
  image_path: null,
  miniature_id: null,
  specifications: [],
  surface_m2: null,
  type_local_id: null,
  created_at: DATE,
  updated_at: DATE,
  site_id: SITE,
  batiment_id: 'b-1',
  batiment_nom: 'Bâtiment A',
  niveau_nom: 'R+2',
  chemin_court: 'Bâtiment A / R+2 / Chambre 214',
  chemin_complet: null,
  type_local: 'Chambre',
}

const METIER: CompteursLieu = {
  equipements: 3,
  gammes: { ouverts: 2, total: 2 },
  ot: { ouverts: 4, total: 9 },
  di: { ouverts: 1, total: 5 },
  travaux: { ouverts: 0, total: 2 },
  evenements: { ouverts: 0, total: 0 },
  documents: 6,
}
// Demandeur : la base renvoie NULL pour tout ce que son rôle ne voit pas.
const DEMANDEUR: CompteursLieu = {
  equipements: 3,
  gammes: null,
  ot: null,
  di: { ouverts: 1, total: 1 },
  travaux: null,
  evenements: null,
  documents: null,
}

function monter(role: string, compteurs: CompteursLieu | null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  qc.setQueryData(currentRoleQueryOptions.queryKey, role)
  qc.setQueryData(localisationsQueries.local(LIEU).queryKey, detail)
  qc.setQueryData(localisationsQueries.fiche(LIEU).queryKey, compteurs)
  const action: { courante: TabAddConfig | null } = { courante: null }

  function Hote() {
    const [api] = useState<TabActionApi>(() => ({
      setAction: (c) => {
        action.courante = c
      },
    }))
    return (
      <TabActionContext.Provider value={api}>
        <LieuFiche localId={LIEU} siteId={SITE} onglets={ONGLETS} />
      </TabActionContext.Provider>
    )
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Hote }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return action
}

const onglet = (nom: RegExp) => screen.findByRole('tab', { name: nom })
const appelsDe = (fn: string) =>
  reseau.appels.filter((a) => a.cible === `rpc:${fn}`).map((a) => a.args)

beforeEach(() => {
  reseau.appels = []
  reseau.reponses = {}
})

describe('LieuFiche — onglets selon le rôle', () => {
  it('rôle métier : les sept onglets, dans l’ordre, avec leurs pastilles', async () => {
    monter('technicien', METIER)
    await onglet(/Équipements/)
    const noms = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(noms).toEqual([
      'Équipements3',
      'Plans de maintenance2',
      'Ordres de travail4',
      'Demandes1',
      'Travaux0',
      'Événements0',
      // Documents : sans pastille (le compteur de la base inclut ceux des équipements).
      'Documents',
    ])
  })

  it('demandeur : compteur NULL → onglet masqué, seuls Équipements et Demandes', async () => {
    monter('demandeur', DEMANDEUR)
    await onglet(/Équipements/)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Équipements3',
      'Demandes1',
    ])
    for (const masque of [
      /Plans/,
      /Ordres/,
      /Travaux/,
      /Événements/,
      /Documents/,
    ])
      expect(screen.queryByRole('tab', { name: masque })).toBeNull()
  })

  it('lieu invisible (fiche NULL) : en-tête seul, aucun onglet', async () => {
    monter('technicien', null)
    expect(await screen.findByText('Chemin')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})

describe('LieuFiche — chaque onglet lit sa RPC, bornée au lieu', () => {
  it.each([
    [/Plans de maintenance/, 'gammes_du_lieu'],
    [/Ordres de travail/, 'ot_du_lieu'],
    [/Demandes/, 'di_du_lieu'],
    [/Travaux/, 'travaux_du_lieu'],
  ])('%s → %s(lieu, non terminés, 50, 0)', async (nom, fn) => {
    monter('technicien', METIER)
    await userEvent.setup().click(await onglet(nom))
    await vi.waitFor(() => expect(appelsDe(fn)).toHaveLength(1))
    expect(appelsDe(fn)[0]).toEqual({
      p_local_id: LIEU,
      p_ouverts_seulement: true,
      p_limite: 50,
      p_decalage: 0,
    })
  })

  it('« Tous les statuts » relit la RPC sans le filtre des non terminés', async () => {
    monter('technicien', METIER)
    const u = userEvent.setup()
    await u.click(await onglet(/Ordres de travail/))
    await vi.waitFor(() => expect(appelsDe('ot_du_lieu')).toHaveLength(1))
    await u.click(screen.getByRole('combobox', { name: 'Filtrer par statut' }))
    await u.click(
      await screen.findByRole('option', { name: 'Tous les statuts' }),
    )
    await vi.waitFor(() => expect(appelsDe('ot_du_lieu')).toHaveLength(2))
    expect(appelsDe('ot_du_lieu')[1]).toMatchObject({
      p_ouverts_seulement: false,
      p_decalage: 0,
    })
  })

  it('une page pleine propose la suite, lue au décalage 50', async () => {
    reseau.reponses['rpc:di_du_lieu'] = Array.from({ length: 50 }, (_, i) => ({
      id: `di-${String(i)}`,
      constat: `Fuite n° ${String(i)}`,
      statut_di_id: 1,
      date_constat: '2026-11-01',
      date_resolution: null,
    }))
    monter('technicien', METIER)
    const u = userEvent.setup()
    await u.click(await onglet(/Demandes/))
    expect(await screen.findByText('Fuite n° 0')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Afficher la suite' }))
    await vi.waitFor(() => expect(appelsDe('di_du_lieu')).toHaveLength(2))
    expect(appelsDe('di_du_lieu')[1]).toMatchObject({
      p_local_id: LIEU,
      p_decalage: 50,
    })
  })

  it('OT : cartes rendues, la recherche filtre les lignes chargées', async () => {
    const ot = (id: string, gamme: string, statut: string) => ({
      id,
      statut,
      origine: 'programme',
      tolerance_jours: 7,
      gamme_id: 'g-1',
      nom_gamme: gamme,
      nom_prestataire: 'Interne',
      nom_equipement: 'Climatiseur',
      description_gamme: null,
      nature_gamme: 'entretien',
      date_prevue: '2026-12-01',
      date_cloture: statut === 'cloture' ? '2026-11-02T12:00:00Z' : null,
      libelle_periodicite: 'Mensuel',
      miniature_id: null,
    })
    reseau.reponses['rpc:ot_du_lieu'] = [
      ot('ot-1', 'Nettoyage des filtres', 'planifie'),
      ot('ot-2', 'Contrôle étanchéité', 'cloture'),
    ]
    monter('technicien', METIER)
    const u = userEvent.setup()
    await u.click(await onglet(/Ordres de travail/))
    expect(await screen.findByText('Nettoyage des filtres')).toBeInTheDocument()
    expect(screen.getByText('Contrôle étanchéité')).toBeInTheDocument()
    await u.type(
      screen.getByPlaceholderText('Rechercher un ordre de travail…'),
      'etancheite',
    )
    await vi.waitFor(() =>
      expect(screen.queryByText('Nettoyage des filtres')).toBeNull(),
    )
    expect(screen.getByText('Contrôle étanchéité')).toBeInTheDocument()
  })

  it('travaux et équipements : lignes rendues depuis la réponse', async () => {
    reseau.reponses['rpc:travaux_du_lieu'] = [
      {
        id: 't-1',
        titre: 'Remplacer la porte',
        description: null,
        statut_travaux_id: 2,
        date_demande: '2026-11-03',
        date_fin: null,
        locaux: { id: LIEU, nom: 'Chambre 214' },
        equipements: null,
      },
    ]
    reseau.reponses['from:v_equipements_complet'] = [
      {
        id: 'e-1',
        categorie_nom: 'Climatiseur',
        categorie_valeur_principale: null,
        categorie_valeur_secondaire: null,
        categorie_valeur_tertiaire: null,
        code_inventaire: 'CLIM-214',
        specifications: [],
        miniature_id: null,
      },
    ]
    monter('technicien', METIER)
    expect(await screen.findByText('CLIM-214')).toBeInTheDocument()
    await userEvent.setup().click(await onglet(/Travaux/))
    await userEvent
      .setup()
      .click(screen.getByRole('combobox', { name: 'Filtrer par statut' }))
    await userEvent
      .setup()
      .click(await screen.findByRole('option', { name: 'Tous les statuts' }))
    expect(await screen.findByText('Remplacer la porte')).toBeInTheDocument()
    expect(screen.getByText(/Chambre 214 · Créé le/)).toBeInTheDocument()
  })

  it('équipements : lecture bornée au lieu, sans RPC', async () => {
    monter('technicien', METIER)
    await onglet(/Équipements/)
    await vi.waitFor(() =>
      expect(
        reseau.appels.some((a) => a.cible === 'from:v_equipements_complet'),
      ).toBe(true),
    )
  })

  it('documents : la brique DocumentsTab sur documents_locaux du lieu', async () => {
    monter('technicien', METIER)
    await userEvent.setup().click(await onglet(/Documents/))
    expect(
      await screen.findByText(`Documents documents_locaux local_id ${LIEU}`),
    ).toBeInTheDocument()
  })
})

describe('LieuFiche — états vides et ajout contextuel', () => {
  it('total 0 : état vide en français, aucune lecture', async () => {
    monter('technicien', METIER)
    await userEvent.setup().click(await onglet(/Événements/))
    expect(await screen.findByText('Aucun événement')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Aucun événement consigné sur ce lieu ni ses équipements.',
      ),
    ).toBeInTheDocument()
    expect(appelsDe('evenements_du_lieu')).toHaveLength(0)
  })

  it('rien de non terminé : « aucun résultat » qui propose d’afficher tout', async () => {
    monter('technicien', METIER)
    await userEvent.setup().click(await onglet(/Travaux/))
    const vide = await screen.findByText(
      'Aucun travaux ne correspond à ces critères.',
    )
    expect(
      within(vide.parentElement!.parentElement!).getByRole('button', {
        name: /Afficher tout/,
      }),
    ).toBeInTheDocument()
  })

  it.each([
    [/Demandes/, "Nouvelle demande d'intervention"],
    [/Travaux/, 'Nouveau travaux'],
    [/Événements/, 'Consigner un événement'],
    [/Documents/, 'Rattacher un document'],
  ])('technicien, onglet %s : bouton + « %s »', async (nom, libelle) => {
    const action = monter('technicien', METIER)
    await userEvent.setup().click(await onglet(nom))
    await vi.waitFor(() => expect(action.courante?.label).toBe(libelle))
    expect(action.courante?.action).toBeTypeOf('function')
  })

  it('lecteur : aucun bouton + sur Demandes ni Travaux', async () => {
    const action = monter('lecteur', METIER)
    const u = userEvent.setup()
    await u.click(await onglet(/Demandes/))
    await screen.findByText('Aucune demande ne correspond à ces critères.')
    expect(action.courante).toBeNull()
    await u.click(screen.getByRole('tab', { name: /Travaux/ }))
    await screen.findByText('Aucun travaux ne correspond à ces critères.')
    expect(action.courante).toBeNull()
  })
})
