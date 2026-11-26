import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { currentRoleQueryOptions } from '@/features/utilisateurs/queries'
import type { ModeleEquipement } from '@/features/modeles-equipements/queries'
import { ModeleEquipementDetail } from '@/features/modeles-equipements/components/modele-equipement-detail'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InstallerDeployer } from './installer-deployer-dialog'

/**
 * « Installer et déployer » depuis la Bibliothèque : visibilité selon le rôle
 * et le site actif, les trois parcours (installer + créer la flotte par la RPC
 * 188 ; recopier un modèle du site dans une flotte ; reprendre une flotte
 * existante sans écrire), l'enchaînement vers l'assistant de déploiement sur
 * la flotte obtenue, et les erreurs traduites (modale laissée ouverte).
 * Faux client : tables → `TABLES`, RPC → `RPC[fn](args)`, insert enregistré.
 */
interface Ecriture {
  cible: string
  args: unknown
}
const reseau = vi.hoisted(() => ({
  ecritures: [] as Ecriture[],
  echec: null as { code: string; message: string } | null,
}))
const toasts = vi.hoisted(() => ({
  succes: [] as string[],
  erreurs: [] as string[],
}))
const site = vi.hoisted((): { activeSiteId: string | null } => ({
  activeSiteId: 'site-1',
}))
vi.mock('sonner', () => ({
  toast: {
    success: (titre: string) => toasts.succes.push(titre),
    error: (m: string) => toasts.erreurs.push(m),
  },
}))
vi.mock('@/features/sites/site-context', () => ({
  useSiteContext: () => ({
    sites: [{ id: 'site-1', nom: 'Hôtel du Parc' }],
    activeSiteId: site.activeSiteId,
    activeSite:
      site.activeSiteId === null
        ? null
        : { id: site.activeSiteId, nom: 'Hôtel du Parc' },
  }),
}))
vi.mock('@/hooks/use-realtime-refresh', () => ({ useRealtimeRefresh: vi.fn() }))
vi.mock('@/features/miniatures/use-miniature-urls', () => ({
  useMiniatureUrls: () => ({ urlOf: () => null, refresh: vi.fn() }),
}))

const CHAMPS = [
  { cle: 'Repère', type: 'texte', requis: false, defaut: null },
  { cle: 'Marque', type: 'texte', requis: false, defaut: null },
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
const modele = (p: Partial<ModeleEquipement>): ModeleEquipement => ({
  id: 'm-commun',
  nom: 'BAES',
  description: 'Bloc autonome',
  site_id: null,
  categorie_id: 'cat-eq',
  est_actif: true,
  miniature_id: null,
  specifications: { champs: CHAMPS },
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  created_by: null,
  image_path: null,
  ...p,
})
const BASE_CATEGORIES = [
  categorie({ id: 'r', nom: 'Sécurité incendie' }),
  categorie({ id: 'r-autre', nom: 'Autre site', site_id: 'site-2' }),
  categorie({ id: 'fl-det', nom: 'Détecteurs', parent_id: 'r' }),
]
const TABLES: Record<string, unknown[]> = {}
const RPC: Record<string, (a: Record<string, unknown>) => unknown> = {
  installer_modele_equipement: (a) => {
    TABLES.categories = [
      ...(TABLES.categories ?? []),
      categorie({
        id: 'fl-neuve',
        nom: a.p_nom_flotte,
        parent_id: a.p_flotte_parent_id,
      }),
    ]
    return { modele_id: 'm-copie', categorie_id: 'fl-neuve' }
  },
}

vi.mock('@/lib/supabase', () => {
  const chaine = (cible: string) => {
    let insertion: unknown = undefined
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_c, m: string) {
          if (m === 'then') return undefined
          if (m === 'throwOnError')
            return () => {
              if (insertion !== undefined) {
                reseau.ecritures.push({ cible, args: insertion })
                if (reseau.echec) {
                  const e = reseau.echec
                  reseau.echec = null
                  return Promise.reject(Object.assign(new Error(e.message), e))
                }
                return Promise.resolve({
                  data: { id: 'fl-copie' },
                  error: null,
                })
              }
              return Promise.resolve({ data: TABLES[cible] ?? [], error: null })
            }
          return (...args: unknown[]) => {
            if (m === 'insert') insertion = args[0]
            return proxy
          }
        },
      },
    )
    return proxy
  }
  const rpcChaine = (fn: string, args: Record<string, unknown>) => {
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_c, m: string) {
          if (m === 'then') return undefined
          if (m === 'throwOnError')
            return () => {
              reseau.ecritures.push({ cible: `rpc:${fn}`, args })
              if (reseau.echec) {
                const e = reseau.echec
                reseau.echec = null
                return Promise.reject(Object.assign(new Error(e.message), e))
              }
              return Promise.resolve({
                data: RPC[fn]?.(args) ?? null,
                error: null,
              })
            }
          return () => proxy
        },
      },
    )
    return proxy
  }
  return { supabase: { from: chaine, rpc: rpcChaine } }
})

function monter(m: ModeleEquipement, role = 'technicien') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(currentRoleQueryOptions.queryKey, role)
  render(
    <QueryClientProvider client={qc}>
      <InstallerDeployer modele={m} />
    </QueryClientProvider>,
  )
}

const bouton = (nom: string | RegExp) =>
  screen.getByRole('button', { name: nom })
const ecritures = () => reseau.ecritures

async function ouvrir(u: ReturnType<typeof userEvent.setup>, nom: string) {
  await u.click(await screen.findByRole('button', { name: nom }))
  return screen.findByRole('dialog')
}

/** L'assistant de déploiement s'ouvre sur la flotte attendue. */
async function assistantSur(libelle: string) {
  await screen.findByText('Étape 1 sur 5 · Famille d’équipements')
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: /Famille/ })).toHaveTextContent(
      libelle,
    ),
  )
}

beforeEach(() => {
  reseau.ecritures = []
  reseau.echec = null
  toasts.succes = []
  toasts.erreurs = []
  site.activeSiteId = 'site-1'
  TABLES.categories = [...BASE_CATEGORIES]
  TABLES.modeles_equipements = [modele({})]
  TABLES.gammes = []
})

describe('InstallerDeployer — visibilité', () => {
  it('lecteur et demandeur : aucun bouton', async () => {
    monter(modele({}), 'lecteur')
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
  })

  it('sans site actif : aucun bouton', () => {
    site.activeSiteId = null
    monter(modele({}))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('modèle d’un autre site : aucun bouton', () => {
    monter(modele({ id: 'm-ailleurs', site_id: 'site-2' }))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('modèle du commun : « Installer et déployer »', () => {
    monter(modele({}))
    expect(bouton('Installer et déployer')).toBeInTheDocument()
  })
})

describe('InstallerDeployer — modèle du commun à installer', () => {
  it('installe + crée la flotte en UNE RPC, puis ouvre l’assistant sur la flotte créée', async () => {
    const u = userEvent.setup()
    monter(modele({}))
    const dlg = await ouvrir(u, 'Installer et déployer')
    // Une seule catégorie racine du site : présélectionnée ; nom = le modèle.
    expect(
      within(dlg).getByRole('combobox', { name: /Catégorie de parc/ }),
    ).toHaveTextContent('Sécurité incendie')
    expect(within(dlg).getByLabelText(/Nom de la flotte/)).toHaveValue('BAES')
    await u.click(
      within(dlg).getByRole('combobox', { name: /Valeur principale/ }),
    )
    await u.click(await screen.findByRole('option', { name: 'Repère' }))
    await u.clear(within(dlg).getByLabelText(/Nom de la flotte/))
    await u.type(
      within(dlg).getByLabelText(/Nom de la flotte/),
      'BAES couloirs',
    )
    await u.click(
      within(dlg).getByRole('button', { name: 'Installer et continuer' }),
    )

    await assistantSur('Sécurité incendie › BAES couloirs')
    expect(ecritures()).toEqual([
      {
        cible: 'rpc:installer_modele_equipement',
        args: {
          p_modele_commun_id: 'm-commun',
          p_site_id: 'site-1',
          p_creer_flotte: true,
          p_flotte_parent_id: 'r',
          p_nom_flotte: 'BAES couloirs',
          p_valeur_principale: 'Repère',
        },
      },
    ])
    expect(toasts.succes).toEqual([
      '« BAES » installé sur Hôtel du Parc, flotte créée',
    ])
  })

  it('refus de la base (homonyme) : message traduit, modale ouverte, rien d’autre', async () => {
    const u = userEvent.setup()
    reseau.echec = {
      code: 'P0001',
      message:
        'Le modèle « BAES » est déjà installé sur Hôtel du Parc (un nom par site) : réutilise-le plutôt que de l’installer une seconde fois.',
    }
    monter(modele({}))
    const dlg = await ouvrir(u, 'Installer et déployer')
    await u.click(
      within(dlg).getByRole('button', { name: 'Installer et continuer' }),
    )
    await waitFor(() => expect(toasts.erreurs).toHaveLength(1))
    expect(toasts.erreurs[0]).toMatch(/déjà installé sur Hôtel du Parc/)
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Installer et déployer',
    )
    expect(screen.queryByText(/Étape 1 sur 5/)).toBeNull()
  })

  it('droits refusés (42501) : message contextualisé', async () => {
    const u = userEvent.setup()
    reseau.echec = { code: '42501', message: 'permission denied' }
    monter(modele({}))
    const dlg = await ouvrir(u, 'Installer et déployer')
    await u.click(
      within(dlg).getByRole('button', { name: 'Installer et continuer' }),
    )
    await waitFor(() =>
      expect(toasts.erreurs).toEqual([
        'Action refusée : ton rôle ou tes sites ne permettent pas d’installer ce modèle sur Hôtel du Parc.',
      ]),
    )
  })

  it('nom vide ou homonyme d’une flotte de la catégorie : refusé sur le champ, sans aller-retour', async () => {
    const u = userEvent.setup()
    monter(modele({}))
    const dlg = await ouvrir(u, 'Installer et déployer')
    const nom = within(dlg).getByLabelText(/Nom de la flotte/)
    await u.clear(nom)
    await u.click(
      within(dlg).getByRole('button', { name: 'Installer et continuer' }),
    )
    expect(
      await within(dlg).findByText('Le nom de la flotte est obligatoire'),
    ).toBeInTheDocument()
    await u.type(nom, 'détecteurs ')
    await u.click(
      within(dlg).getByRole('button', { name: 'Installer et continuer' }),
    )
    expect(
      await within(dlg).findByText(/Une flotte de ce nom existe déjà/),
    ).toBeInTheDocument()
    expect(ecritures()).toEqual([])
  })

  it('aucune catégorie de parc sur le site : explication, bouton désactivé', async () => {
    const u = userEvent.setup()
    TABLES.categories = []
    monter(modele({}))
    const dlg = await ouvrir(u, 'Installer et déployer')
    expect(
      within(dlg).getByText(/Aucune catégorie de parc sur Hôtel du Parc/),
    ).toBeInTheDocument()
    expect(
      within(dlg).getByRole('button', { name: 'Installer et continuer' }),
    ).toBeDisabled()
  })
})

describe('InstallerDeployer — modèle déjà sur le site', () => {
  it('modèle du site : flotte homonyme présélectionnée, « Continuer » ouvre l’assistant sans écrire', async () => {
    const u = userEvent.setup()
    const duSite = modele({
      id: 'm-site',
      nom: 'Détecteurs',
      site_id: 'site-1',
    })
    TABLES.modeles_equipements = [duSite]
    monter(duSite)
    const dlg = await ouvrir(u, 'Déployer dans des lieux')
    expect(
      within(dlg).getByRole('radio', { name: /Utiliser une flotte existante/ }),
    ).toBeChecked()
    expect(
      within(dlg).getByRole('combobox', { name: /Flotte du site/ }),
    ).toHaveTextContent('Sécurité incendie › Détecteurs')
    await u.click(within(dlg).getByRole('button', { name: 'Continuer' }))
    await assistantSur('Sécurité incendie › Détecteurs')
    expect(ecritures()).toEqual([])
    expect(toasts.succes).toEqual([])
  })

  it('commun déjà installé : la nouvelle flotte RECOPIE la copie du site (un insert, sans lien)', async () => {
    const u = userEvent.setup()
    const copie = modele({
      id: 'm-copie',
      site_id: 'site-1',
      description: 'Copie locale',
      miniature_id: 'mini-1',
      specifications: { champs: CHAMPS.slice(0, 1) },
    })
    TABLES.modeles_equipements = [modele({}), copie]
    monter(modele({}))
    const dlg = await ouvrir(u, 'Installer et déployer')
    expect(dlg).toHaveTextContent('Déployer le modèle')
    expect(
      within(dlg).getByText(/est déjà installé sur Hôtel du Parc/),
    ).toBeInTheDocument()
    await u.click(
      within(dlg).getByRole('button', { name: 'Créer et continuer' }),
    )
    await waitFor(() => expect(toasts.succes).toEqual(['Flotte créée']))
    expect(ecritures()).toEqual([
      {
        cible: 'categories',
        args: {
          nom: 'BAES',
          scope: 'parc',
          site_id: 'site-1',
          parent_id: 'r',
          description: 'Copie locale',
          miniature_id: 'mini-1',
          modele_equipement_id: null,
          specifications: {
            champs: [expect.objectContaining({ cle: 'Repère' })],
          },
          valeur_principale: null,
          valeur_secondaire: null,
          valeur_tertiaire: null,
        },
      },
    ])
    await screen.findByText('Étape 1 sur 5 · Famille d’équipements')
  })

  it('mode existante sans flotte choisie : refusé sur le champ', async () => {
    const u = userEvent.setup()
    monter(modele({}))
    const dlg = await ouvrir(u, 'Installer et déployer')
    await u.click(
      within(dlg).getByRole('radio', { name: /Utiliser une flotte existante/ }),
    )
    await u.click(within(dlg).getByRole('button', { name: 'Continuer' }))
    expect(
      await within(dlg).findByText('Choisis la flotte à déployer.'),
    ).toBeInTheDocument()
  })
})

describe('câblage — détail d’un modèle', () => {
  it('les actions injectées s’affichent sous l’en-tête du modèle', async () => {
    const qc = new QueryClient()
    qc.setQueryData(currentRoleQueryOptions.queryKey, 'manager')
    const m = modele({})
    render(
      <QueryClientProvider client={qc}>
        <ModeleEquipementDetail
          modele={m}
          canEdit={false}
          actions={<InstallerDeployer modele={m} />}
        />
      </QueryClientProvider>,
    )
    expect(
      await screen.findByRole('button', { name: 'Installer et déployer' }),
    ).toBeInTheDocument()
  })

  it('les actions injectées cohabitent avec l’édition des caractéristiques', async () => {
    const u = userEvent.setup()
    const qc = new QueryClient()
    qc.setQueryData(currentRoleQueryOptions.queryKey, 'manager')
    const m = modele({ site_id: 'site-1' })
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ModeleEquipementDetail
            modele={m}
            canEdit
            actions={<InstallerDeployer modele={m} />}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(
      await screen.findByRole('button', { name: 'Déployer dans des lieux' }),
    ).toBeInTheDocument()
    await u.click(
      screen.getAllByRole('button', { name: 'Modifier le champ' })[0]!,
    )
    const dlg = await screen.findByRole('dialog')
    expect(dlg).toHaveTextContent('Modifier la caractéristique d’équipement')
    await u.click(within(dlg).getByRole('button', { name: 'Annuler' }))
    await u.click(screen.getByRole('button', { name: 'Ajouter un champ' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Nouvelle caractéristique d’équipement',
    )
  })
})
