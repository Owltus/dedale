import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { currentRoleQueryOptions } from '@/features/utilisateurs/queries'
import {
  TabActionContext,
  type TabActionApi,
  type TabAddConfig,
} from '@/components/common/tab-actions'
import { DeploiementDialog } from './deploiement-dialog'
import { LieuOngletEquipements } from './lieu-onglet-equipements'

/**
 * Assistant de déploiement en masse : les cinq étapes, l'aperçu affiché TEL
 * QUE rendu par la RPC, la confirmation qui renvoie exactement les paramètres
 * de l'aperçu, les erreurs traduites, l'annulation depuis le toast, et le
 * bouton selon le rôle. Faux client : tables → `TABLES`, RPC → `RPC[fn](args)`.
 */
interface Reseau {
  rpc: { fn: string; args: Record<string, unknown> }[]
  echecs: Partial<Record<string, { code: string; message: string }>>
}
const reseau = vi.hoisted((): Reseau => ({ rpc: [], echecs: {} }))
const toasts = vi.hoisted(() => ({
  succes: [] as { titre: string; options?: unknown }[],
  erreurs: [] as string[],
}))
vi.mock('sonner', () => ({
  toast: {
    success: (titre: string, options?: unknown) =>
      toasts.succes.push({ titre, options }),
    error: (m: string) => toasts.erreurs.push(m),
  },
}))

const CHAMPS = [
  { cle: 'Repère', type: 'texte', requis: true, defaut: null },
  { cle: 'Marque', type: 'texte', requis: false, defaut: 'Acme' },
  { cle: 'Puissance', type: 'nombre', requis: true, defaut: null },
]
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
    categorie({
      id: 'sc',
      nom: 'Détecteurs',
      parent_id: 'r',
      valeur_principale: 'Repère',
      specifications: { champs: CHAMPS },
    }),
  ],
  modeles_equipements: [],
  gammes: [
    { id: 'g1', nom: 'SSI annuel', repeter_par_equipement: true },
    { id: 'g2', nom: 'Contrôle visuel', repeter_par_equipement: false },
  ],
  batiments: [{ id: 'bA', nom: 'Bâtiment A' }],
  niveaux: [{ id: 'n1', nom: 'R+1', batiment_id: 'bA' }],
  locaux: [
    { id: 'l101', nom: 'Chambre 101', niveau_id: 'n1', type_local_id: null },
    { id: 'l102', nom: 'Chambre 102', niveau_id: 'n1', type_local_id: null },
  ],
  types_locaux: [],
}
let aCreer = 1
const APERCU = (appliquer: boolean) => ({
  mode: appliquer ? 'enregistré' : 'aperçu (rien n’est enregistré)',
  site: { id: 'site-1', nom: 'Hôtel du Parc' },
  sous_categorie: {
    id: 'sc',
    nom: 'Détecteurs',
    categorie: 'Sécurité incendie',
    modele: 'DO-500',
  },
  lieux_demandes: 2,
  a_creer: aCreer,
  doublons_ignores: true,
  doublons: [
    {
      local_id: 'l102',
      lieu: 'Chambre 102',
      batiment: 'Bâtiment A',
      niveau: 'R+1',
      existants: 1,
    },
  ],
  par_batiment_niveau: [
    { batiment: 'Bâtiment A', niveau: 'R+1', a_creer: aCreer, doublons: 1 },
  ],
  exemples: [
    {
      lieu: 'Chambre 101',
      libelle: 'Détecteurs Chambre 101',
      specifications: {
        champs: [{ ...CHAMPS[0], valeur: 'Chambre 101' }],
      },
    },
  ],
  gammes: [
    {
      id: 'g1',
      nom: 'SSI annuel',
      repeter_par_equipement: true,
      ot_ouverts: 2,
      operations_ajoutees_ot_ouverts: 3,
    },
  ],
  lot: appliquer ? 'LOT-1' : null,
  equipement_ids: appliquer ? ['e1'] : [],
})
const RPC: Record<string, (args: Record<string, unknown>) => unknown> = {
  deployer_equipements: (a) => APERCU(a.p_appliquer === true),
  annuler_deploiement: (a) => ({
    lot: a.p_lot,
    total: 2,
    a_supprimer: 1,
    supprimes: a.p_appliquer === true ? 1 : 0,
    conserves: [{ id: 'e0', lieu: 'Chambre 103', raisons: ['documents'] }],
    gammes: [
      { id: 'g1', nom: 'SSI annuel', operations_retirees_ot_ouverts: 3 },
    ],
  }),
}

vi.mock('@/hooks/use-realtime-refresh', () => ({ useRealtimeRefresh: vi.fn() }))
vi.mock('@/features/miniatures/use-miniature-urls', () => ({
  useMiniatureUrls: () => ({ urlOf: () => null, refresh: vi.fn() }),
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
      from: (table: string) =>
        chaine(() =>
          Promise.resolve({ data: TABLES[table] ?? [], error: null }),
        ),
      rpc: (fn: string, args: Record<string, unknown>) =>
        chaine(() => {
          reseau.rpc.push({ fn, args })
          const echec = reseau.echecs[fn]
          if (echec) {
            reseau.echecs = { ...reseau.echecs, [fn]: undefined }
            return Promise.reject(
              Object.assign(new Error(echec.message), echec),
            )
          }
          return Promise.resolve({ data: RPC[fn]?.(args) ?? null, error: null })
        }),
    },
  }
})

function client(role = 'technicien') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(currentRoleQueryOptions.queryKey, role)
  return qc
}

function monter(props: { categorieIdParDefaut?: string } = {}) {
  function Hote() {
    const [open, setOpen] = useState(true)
    return (
      <DeploiementDialog
        open={open}
        onOpenChange={setOpen}
        siteId="site-1"
        {...props}
      />
    )
  }
  render(
    <QueryClientProvider client={client()}>
      <Hote />
    </QueryClientProvider>,
  )
}

const bouton = (nom: string | RegExp) =>
  screen.getByRole('button', { name: nom })
const appels = (fn: string) =>
  reseau.rpc.filter((r) => r.fn === fn).map((r) => r.args)

/** Étapes 1 à 4 jusqu'au bouton « Voir l'aperçu » (Bâtiment A, Bosch, 5 kW, SSI). */
async function jusquAuxPlans(u: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Étape 1 sur 5 · Famille d’équipements')
  expect(
    await screen.findByRole('combobox', { name: /Famille/ }),
  ).toHaveTextContent('Sécurité incendie › Détecteurs')
  await u.click(bouton('Suivant'))
  await screen.findByText('Étape 2 sur 5 · Lieux')
  expect(bouton('Suivant')).toBeDisabled()
  await u.click(
    await screen.findByRole('checkbox', {
      name: (n) => n.startsWith('Bâtiment A'),
    }),
  )
  await u.click(bouton('Suivant'))
  await screen.findByText('Étape 3 sur 5 · Caractéristiques')
  // Principale : vide, « Nom du lieu » en attente ; les autres au défaut.
  expect(screen.getByLabelText('Repère *')).toHaveAttribute(
    'placeholder',
    'Nom du lieu',
  )
  expect(screen.getByLabelText('Repère *')).toHaveValue('')
  expect(screen.getByLabelText('Marque')).toHaveValue('Acme')
  // Obligatoire vide (hors principale) : bloqué, message sur le champ.
  await u.click(bouton('Suivant'))
  expect(
    screen.getByText('Le champ « Puissance » est obligatoire.'),
  ).toBeInTheDocument()
  await u.type(screen.getByLabelText('Puissance *'), '5')
  await u.clear(screen.getByLabelText('Marque'))
  await u.type(screen.getByLabelText('Marque'), 'Bosch')
  await u.click(bouton('Suivant'))
  await screen.findByText('Étape 4 sur 5 · Plans de maintenance')
  expect(screen.getByText('Aucun plan coché')).toBeInTheDocument()
  await u.click(
    screen.getByRole('checkbox', { name: (n) => n.startsWith('SSI annuel') }),
  )
}

const ATTENDUS = {
  p_categorie_id: 'sc',
  p_local_ids: ['l101', 'l102'],
  p_valeurs: { Marque: 'Bosch', Puissance: 5 },
  p_gamme_ids: ['g1'],
  p_ignorer_doublons: true,
}

beforeEach(() => {
  reseau.rpc = []
  reseau.echecs = {}
  toasts.succes = []
  toasts.erreurs = []
  aCreer = 1
})

describe('DeploiementDialog — parcours complet', () => {
  it('étapes → aperçu rendu par la base → confirmation avec les MÊMES paramètres', async () => {
    monter({ categorieIdParDefaut: 'sc' })
    const u = userEvent.setup()
    await jusquAuxPlans(u)
    expect(appels('deployer_equipements')).toEqual([])
    await u.click(bouton('Voir l’aperçu'))

    await screen.findByText('Étape 5 sur 5 · Aperçu')
    expect(appels('deployer_equipements')).toEqual([
      { ...ATTENDUS, p_appliquer: false },
    ])
    // Ce que la base a rendu, sans réinterprétation.
    expect(screen.getByText(/1 équipement à créer/)).toBeInTheDocument()
    expect(
      screen.getByText(
        /Sécurité incendie › Détecteurs · modèle « DO-500 » · Hôtel du Parc/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Chambre 102 \(Bâtiment A \/ R\+1\) — 1 existant/),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'R+1' })).toBeInTheDocument()
    expect(screen.getByText('Détecteurs Chambre 101')).toBeInTheDocument()
    expect(
      screen.getByText(/2 ordres de travail ouverts · 3 opérations ajoutées/),
    ).toBeInTheDocument()

    await u.click(bouton('Créer 1 équipement'))
    await waitFor(() => expect(appels('deployer_equipements')).toHaveLength(2))
    expect(appels('deployer_equipements')[1]).toEqual({
      ...ATTENDUS,
      p_appliquer: true,
    })
    await waitFor(() =>
      expect(screen.queryByText('Déployer des équipements')).toBeNull(),
    )
    expect(toasts.succes[0]?.titre).toBe('1 équipement déployé')
    expect(toasts.succes[0]?.options).toMatchObject({
      action: { label: 'Annuler ce déploiement' },
    })
  })

  it('« Précédent » depuis l’aperçu, et doublons non ignorés : nouvel aperçu', async () => {
    monter({ categorieIdParDefaut: 'sc' })
    const u = userEvent.setup()
    await jusquAuxPlans(u)
    await u.click(bouton('Voir l’aperçu'))
    await screen.findByText('Étape 5 sur 5 · Aperçu')
    await u.click(screen.getByRole('checkbox', { name: /Ignorer ces lieux/ }))
    await waitFor(() => expect(appels('deployer_equipements')).toHaveLength(2))
    expect(appels('deployer_equipements')[1]).toMatchObject({
      p_ignorer_doublons: false,
      p_appliquer: false,
    })
    await u.click(bouton('Précédent'))
    expect(
      await screen.findByText('Étape 4 sur 5 · Plans de maintenance'),
    ).toBeInTheDocument()
  })

  it('rien à créer : le bouton de confirmation est désactivé', async () => {
    aCreer = 0
    monter({ categorieIdParDefaut: 'sc' })
    const u = userEvent.setup()
    await jusquAuxPlans(u)
    await u.click(bouton('Voir l’aperçu'))
    await screen.findByText('Aucun équipement à créer', { exact: false })
    expect(bouton('Rien à créer')).toBeDisabled()
  })

  it('sans famille pré-choisie : « Suivant » attend un choix', async () => {
    monter()
    await screen.findByText('Étape 1 sur 5 · Famille d’équipements')
    expect(bouton('Suivant')).toBeDisabled()
  })
})

describe('DeploiementDialog — erreurs traduites', () => {
  it('refus métier à l’aperçu : message de la base, on reste à l’étape', async () => {
    reseau.echecs.deployer_equipements = {
      code: 'P0001',
      message:
        'Un plan de maintenance du commun ne se rattache pas : installe-le d’abord sur le site.',
    }
    monter({ categorieIdParDefaut: 'sc' })
    const u = userEvent.setup()
    await jusquAuxPlans(u)
    await u.click(bouton('Voir l’aperçu'))
    await waitFor(() => expect(toasts.erreurs).toHaveLength(1))
    expect(toasts.erreurs[0]).toMatch(/du commun ne se rattache pas/)
    expect(
      screen.getByText('Étape 4 sur 5 · Plans de maintenance'),
    ).toBeInTheDocument()
  })

  it('refus de droits à la confirmation : message reformulé, modale ouverte', async () => {
    monter({ categorieIdParDefaut: 'sc' })
    const u = userEvent.setup()
    await jusquAuxPlans(u)
    await u.click(bouton('Voir l’aperçu'))
    await screen.findByText('Étape 5 sur 5 · Aperçu')
    reseau.echecs.deployer_equipements = {
      code: '42501',
      message: 'Déploiement refusé : 1 lieu(x) introuvable(s)',
    }
    await u.click(bouton('Créer 1 équipement'))
    await waitFor(() => expect(toasts.erreurs).toHaveLength(1))
    expect(toasts.erreurs[0]).toMatch(
      /^Déploiement refusé : un lieu, la famille/,
    )
    expect(screen.getByText('Étape 5 sur 5 · Aperçu')).toBeInTheDocument()
    expect(toasts.succes).toEqual([])
  })
})

describe('DeploiementDialog — annulation depuis le toast', () => {
  it('aperçu de l’annulation (conservés et raisons) puis suppression du lot', async () => {
    monter({ categorieIdParDefaut: 'sc' })
    const u = userEvent.setup()
    await jusquAuxPlans(u)
    await u.click(bouton('Voir l’aperçu'))
    await u.click(
      await screen.findByRole('button', { name: 'Créer 1 équipement' }),
    )
    await waitFor(() => expect(toasts.succes).toHaveLength(1))
    const options = toasts.succes[0]?.options as {
      action: { onClick: () => void }
    }
    act(() => options.action.onClick())

    expect(
      await screen.findByText('Supprimer l’équipement de ce déploiement ?'),
    ).toBeInTheDocument()
    expect(appels('annuler_deploiement')).toEqual([
      { p_lot: 'LOT-1', p_appliquer: false },
    ])
    expect(
      await screen.findByText(/Chambre 103 \(documents\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(/SSI annuel \(3\)/)).toBeInTheDocument()

    await u.click(bouton('Supprimer'))
    await waitFor(() => expect(appels('annuler_deploiement')).toHaveLength(2))
    expect(appels('annuler_deploiement')[1]).toEqual({
      p_lot: 'LOT-1',
      p_appliquer: true,
    })
    await waitFor(() =>
      expect(toasts.succes.at(-1)?.titre).toBe(
        'Déploiement annulé : 1 équipement supprimé',
      ),
    )
  })
})

describe('Fiche d’un lieu, onglet Équipements — bouton selon le rôle', () => {
  function monterOnglet(role: string) {
    const action: { courante: TabAddConfig | null } = { courante: null }
    function Hote() {
      const [api] = useState<TabActionApi>(() => ({
        setAction: (c) => {
          action.courante = c
        },
      }))
      return (
        <TabActionContext.Provider value={api}>
          <LieuOngletEquipements localId="l101" siteId="site-1" total={0} />
        </TabActionContext.Provider>
      )
    }
    render(
      <QueryClientProvider client={client(role)}>
        <Hote />
      </QueryClientProvider>,
    )
    return action
  }

  it.each(['admin', 'manager', 'technicien'])(
    '%s : « Ajouter des équipements », lieu pré-coché',
    async (role) => {
      const action = monterOnglet(role)
      await waitFor(() =>
        expect(action.courante?.label).toBe('Ajouter des équipements'),
      )
      act(() => action.courante?.action?.())
      await screen.findByText('Étape 1 sur 5 · Famille d’équipements')
    },
  )

  it.each(['lecteur', 'demandeur'])('%s : aucun bouton', async (role) => {
    const action = monterOnglet(role)
    await screen.findByText('Aucun équipement')
    expect(action.courante).toBeNull()
  })
})
