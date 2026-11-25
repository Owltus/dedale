import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { Session } from '@supabase/supabase-js'
import type { RouterContext } from '@/routes/__root'
import { Route as ConsentementRoute } from '@/routes/oauth.consent'

/**
 * Écran de consentement du connecteur Claude, monté sous un VRAI routeur (route
 * `/oauth/consent` du dépôt, sa recherche validée et sa garde de session).
 * Couvre : lien incomplet, sans session, demande en chargement / en erreur /
 * chargée (droits, confiance), déjà autorisée, accepter, refuser, et les états
 * des boutons pendant et après l'envoi. Comportement ACTUEL.
 */
const sb = vi.hoisted(() => ({
  details: vi.fn(),
  approuver: vi.fn(),
  refuser: vi.fn(),
  moi: vi.fn(),
  filtres: [] as [string, string, unknown][],
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      oauth: {
        getAuthorizationDetails: sb.details,
        approveAuthorization: sb.approuver,
        denyAuthorization: sb.refuser,
      },
    },
    from: (table: string) => {
      const chaine = {
        select: () => chaine,
        eq: (colonne: string, valeur: unknown) => {
          sb.filtres.push([table, colonne, valeur])
          return chaine
        },
        maybeSingle: () => chaine,
        throwOnError: () => sb.moi() as Promise<unknown>,
      }
      return chaine
    },
  },
}))

const authEtat = vi.hoisted(() => ({ session: null as Session | null }))
vi.mock('@/auth', () => ({ useAuth: () => authEtat }))

const SESSION = {
  access_token: 'jeton',
  user: { id: 'u-1' },
} as unknown as Session
const RETOUR_CLAUDE = 'https://claude.ai/api/mcp/auth_callback'

function details(
  options: { nom?: string; redirect?: string } = {},
): Record<string, unknown> {
  return {
    data: {
      authorization_id: 'abc',
      client: { name: options.nom ?? 'Claude' },
      user: { email: 'jean@exemple.fr' },
      redirect_uri: options.redirect ?? RETOUR_CLAUDE,
    },
    error: null,
  }
}

function droits(
  moi: {
    acces_ia: boolean
    acces_ia_ecriture: boolean
    est_actif: boolean
  } | null,
) {
  sb.moi.mockResolvedValue({ data: moi, error: null })
}

function preparer() {
  sb.details.mockReset()
  sb.approuver.mockReset()
  sb.refuser.mockReset()
  sb.moi.mockReset()
  sb.filtres.length = 0
  authEtat.session = SESSION
}

function monter(chemin: string, session: Session | null = SESSION) {
  authEtat.session = session
  const qc = new QueryClient()
  const racine = createRootRouteWithContext<RouterContext>()({
    component: () => <Outlet />,
  })
  const login = createRoute({
    getParentRoute: () => racine,
    path: '/login',
    validateSearch: (s: Record<string, unknown>) => s,
    component: () => <p>Écran de connexion</p>,
  })
  const consentement = ConsentementRoute.update({
    id: '/oauth/consent',
    path: '/oauth/consent',
    getParentRoute: () => racine,
  } as never)
  const router = createRouter({
    routeTree: racine.addChildren([login, consentement]),
    history: createMemoryHistory({ initialEntries: [chemin] }),
    context: { auth: { session, isLoading: false }, queryClient: qc },
  })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

/** Promesse pilotée à la main : l'envoi reste « en cours » tant qu'on veut. */
function differe<T>() {
  let resoudre: (v: T) => void = () => undefined
  const promesse = new Promise<T>((r) => {
    resoudre = r
  })
  return { promesse, resoudre }
}

const bouton = (nom: string | RegExp) =>
  screen.getByRole('button', { name: nom })

describe('écran de consentement — demande', () => {
  it('sans identifiant d’autorisation : lien incomplet, rien n’est demandé à Supabase', async () => {
    preparer()
    monter('/oauth/consent')
    expect(
      await screen.findByText(/Le lien utilisé est incomplet/),
    ).toBeInTheDocument()
    expect(sb.details).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(document.title).toContain('Autoriser Claude')
  })

  // `validateSearch` de la route renvoie `{}` pour un identifiant mal formé,
  // mais TanStack Router FUSIONNE la recherche validée avec celle du parent (la
  // racine, sans validation : la recherche brute). `Route.useSearch()` rend donc
  // l'identifiant brut, qui part tel quel vers `getAuthorizationDetails` (et
  // `beforeLoad` le reporte aussi vers /login). Le filtre `IDENTIFIANT` est sans
  // effet ; Supabase refuse ensuite la demande (« plus valable »).
  it.fails(
    'BUG CANDIDAT : identifiant mal formé transmis à Supabase malgré le filtre de la route',
    async () => {
      preparer()
      monter('/oauth/consent?authorization_id=https://pirate.example')
      expect(
        await screen.findByText(/Le lien utilisé est incomplet/),
      ).toBeInTheDocument()
      expect(sb.details).not.toHaveBeenCalled()
    },
  )

  it('sans session : renvoi vers la connexion, l’identifiant suit dans « autorisation »', async () => {
    preparer()
    const router = monter('/oauth/consent?authorization_id=abc', null)
    await screen.findByText('Écran de connexion')
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toEqual({ autorisation: 'abc' })
    expect(sb.details).not.toHaveBeenCalled()
  })

  it('sans session ni identifiant : connexion sans paramètre', async () => {
    preparer()
    const router = monter('/oauth/consent', null)
    await screen.findByText('Écran de connexion')
    expect(router.state.location.search).toEqual({})
  })

  it('en chargement : squelette, aucun bouton', async () => {
    preparer()
    sb.details.mockReturnValue(new Promise(() => undefined))
    monter('/oauth/consent?authorization_id=abc')
    await waitFor(() => expect(sb.details).toHaveBeenCalledWith('abc'))
    expect(
      document.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('en erreur (demande expirée) : message, aucun bouton, pas de nouvel essai', async () => {
    preparer()
    sb.details.mockResolvedValue({ data: null, error: new Error('expirée') })
    monter('/oauth/consent?authorization_id=abc')
    expect(
      await screen.findByText(/Cette demande n’est plus valable/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(sb.details).toHaveBeenCalledTimes(1)
    expect(sb.moi).not.toHaveBeenCalled()
  })

  it('chargée, accès en lecture : client, e-mail, lieu de retour, droits lus sur SA fiche, deux boutons', async () => {
    preparer()
    sb.details.mockResolvedValue(details())
    droits({ acces_ia: true, acces_ia_ecriture: false, est_actif: true })
    monter('/oauth/consent?authorization_id=abc')
    expect(await screen.findByText('jean@exemple.fr')).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('claude.ai')).toBeInTheDocument()
    expect(
      screen.getByText('lire tes données, sans rien modifier ;'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Ton administrateur t’a ouvert l’accès Claude en lecture\./,
      ),
    ).toBeInTheDocument()
    expect(bouton('Refuser')).toBeEnabled()
    expect(bouton('Autoriser')).toBeEnabled()
    expect(sb.filtres).toEqual([['users', 'id', 'u-1']])
  })

  it('chargée, accès en modification : la liste des droits et le bandeau le disent', async () => {
    preparer()
    sb.details.mockResolvedValue(
      details({ redirect: 'http://localhost:3118/callback' }),
    )
    droits({ acces_ia: true, acces_ia_ecriture: true, est_actif: true })
    monter('/oauth/consent?authorization_id=abc')
    expect(
      await screen.findByText(/enregistrer l’avancement des ordres de travail/),
    ).toBeInTheDocument()
    expect(screen.getByText(/en lecture et modification\./)).toBeInTheDocument()
    expect(screen.getByText('ton ordinateur (Claude Code)')).toBeInTheDocument()
  })

  it.each([
    [
      'accès Claude fermé',
      { acces_ia: false, acces_ia_ecriture: true, est_actif: true },
    ],
    [
      'compte désactivé',
      { acces_ia: true, acces_ia_ecriture: false, est_actif: false },
    ],
    ['fiche invisible', null],
  ])('%s : avertissement, seul « Refuser » est proposé', async (_cas, moi) => {
    preparer()
    sb.details.mockResolvedValue(details())
    droits(moi)
    monter('/oauth/consent?authorization_id=abc')
    expect(
      await screen.findByText(
        /Ton administrateur ne t’a pas ouvert l’accès Claude/,
      ),
    ).toBeInTheDocument()
    expect(bouton('Refuser')).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Autoriser' }),
    ).not.toBeInTheDocument()
  })

  it('client sans nom : « Application inconnue »', async () => {
    preparer()
    sb.details.mockResolvedValue(details({ nom: '' }))
    droits({ acces_ia: true, acces_ia_ecriture: false, est_actif: true })
    monter('/oauth/consent?authorization_id=abc')
    expect(await screen.findByText('Application inconnue')).toBeInTheDocument()
  })

  it('retour non reconnu (pas Claude) : alerte d’hameçonnage, jamais de bouton « Autoriser », même avec les droits', async () => {
    preparer()
    sb.details.mockResolvedValue(
      details({ redirect: 'https://pirate.example/api/mcp/auth_callback' }),
    )
    droits({ acces_ia: true, acces_ia_ecriture: true, est_actif: true })
    monter('/oauth/consent?authorization_id=abc')
    expect(
      await screen.findByText(/ce n’est pas le connecteur officiel/),
    ).toBeInTheDocument()
    expect(screen.getByText('pirate.example')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Autoriser' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/t’a ouvert l’accès/)).not.toBeInTheDocument()
  })

  it('déjà autorisée, retour vers Claude : redirection immédiate, squelette affiché, droits non lus', async () => {
    preparer()
    sb.details.mockResolvedValue({
      data: { redirect_url: RETOUR_CLAUDE },
      error: null,
    })
    const aller = vi.fn()
    const origine = window.location
    // jsdom ne navigue pas : on remplace `location` le temps du test.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: origine.href, assign: aller },
    })
    try {
      monter('/oauth/consent?authorization_id=abc')
      await waitFor(() => expect(aller).toHaveBeenCalledWith(RETOUR_CLAUDE))
      expect(
        document.querySelectorAll('[data-slot="skeleton"]').length,
      ).toBeGreaterThan(0)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(sb.moi).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: origine,
      })
    }
  })

  it('déjà autorisée, retour NON reconnu : pas de redirection, demande présentée comme invalide', async () => {
    preparer()
    sb.details.mockResolvedValue({
      data: { redirect_url: 'https://pirate.example/cb' },
      error: null,
    })
    monter('/oauth/consent?authorization_id=abc')
    expect(
      await screen.findByText(/Cette demande n’est plus valable/),
    ).toBeInTheDocument()
  })
})

describe('écran de consentement — réponse', () => {
  async function pret(
    redirect: string = RETOUR_CLAUDE,
    acces = true,
  ): Promise<void> {
    preparer()
    sb.details.mockResolvedValue(details({ redirect }))
    droits({ acces_ia: acces, acces_ia_ecriture: false, est_actif: true })
    monter('/oauth/consent?authorization_id=abc')
    await screen.findByText('jean@exemple.fr')
  }

  it('accepter : « Autorisation… » et les deux boutons figés pendant l’envoi, puis restent figés (Supabase redirige)', async () => {
    await pret()
    const envoi = differe<{ error: null }>()
    sb.approuver.mockReturnValue(envoi.promesse)
    await userEvent.setup().click(bouton('Autoriser'))
    expect(sb.approuver).toHaveBeenCalledWith('abc')
    expect(sb.refuser).not.toHaveBeenCalled()
    expect(bouton('Autorisation…')).toBeDisabled()
    expect(bouton('Refuser')).toBeDisabled()
    envoi.resoudre({ error: null })
    await waitFor(() => expect(bouton('Autorisation…')).toBeDisabled())
    expect(bouton('Refuser')).toBeDisabled()
    expect(screen.queryByText(/Demande refusée/)).not.toBeInTheDocument()
  })

  it('accepter puis échec : message d’erreur, boutons de nouveau utilisables, nouvel essai efface l’erreur', async () => {
    await pret()
    sb.approuver.mockResolvedValue({ error: new Error('Serveur indisponible') })
    const u = userEvent.setup()
    await u.click(bouton('Autoriser'))
    expect(await screen.findByText('Serveur indisponible')).toBeInTheDocument()
    expect(bouton('Autoriser')).toBeEnabled()
    expect(bouton('Refuser')).toBeEnabled()
    sb.approuver.mockReturnValue(new Promise(() => undefined))
    await u.click(bouton('Autoriser'))
    expect(screen.queryByText('Serveur indisponible')).not.toBeInTheDocument()
  })

  it('refuser une application de confiance : Supabase redirige lui-même (skipBrowserRedirect: false), « Refus… » pendant l’envoi', async () => {
    await pret()
    const envoi = differe<{ error: null }>()
    sb.refuser.mockReturnValue(envoi.promesse)
    await userEvent.setup().click(bouton('Refuser'))
    expect(sb.refuser).toHaveBeenCalledWith('abc', {
      skipBrowserRedirect: false,
    })
    expect(bouton('Refus…')).toBeDisabled()
    expect(bouton('Autoriser')).toBeDisabled()
    envoi.resoudre({ error: null })
    await waitFor(() => expect(sb.refuser).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Demande refusée/)).not.toBeInTheDocument()
  })

  it('refuser une application NON reconnue : pas de renvoi vers elle, « Demande refusée », bouton figé', async () => {
    await pret('https://pirate.example/cb')
    sb.refuser.mockResolvedValue({ error: null })
    await userEvent.setup().click(bouton('Refuser'))
    expect(sb.refuser).toHaveBeenCalledWith('abc', {
      skipBrowserRedirect: true,
    })
    expect(
      await screen.findByText('Demande refusée. Tu peux fermer cette page.'),
    ).toBeInTheDocument()
    expect(bouton('Refus…')).toBeDisabled()
    expect(sb.approuver).not.toHaveBeenCalled()
  })

  it('refuser sans accès ouvert : même chemin que de confiance (redirection par Supabase)', async () => {
    await pret(RETOUR_CLAUDE, false)
    sb.refuser.mockResolvedValue({ error: null })
    await userEvent.setup().click(bouton('Refuser'))
    expect(sb.refuser).toHaveBeenCalledWith('abc', {
      skipBrowserRedirect: false,
    })
  })

  it('refuser puis échec : message, « Refuser » de nouveau utilisable', async () => {
    await pret('https://pirate.example/cb')
    sb.refuser.mockResolvedValue({ error: new Error('Refus impossible') })
    await userEvent.setup().click(bouton('Refuser'))
    expect(await screen.findByText('Refus impossible')).toBeInTheDocument()
    expect(bouton('Refuser')).toBeEnabled()
    expect(screen.queryByText(/Demande refusée/)).not.toBeInTheDocument()
  })
})
