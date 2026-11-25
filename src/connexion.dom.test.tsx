import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import type { Session } from '@supabase/supabase-js'
import type { RouterContext } from './routes/__root'
import { Route as LoginRoute } from './routes/login'

/**
 * Écran de connexion monté sous un VRAI routeur (route `/login` du dépôt, ses
 * gardes et sa recherche validée) : succès → redirection, échec → message
 * français (`messageErreurAuth`), champs vides → refus du navigateur, session
 * déjà ouverte → pas d'écran de connexion.
 */
const signIn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: signIn } },
}))

function monter(chemin: string, session: Session | null = null) {
  const racine = createRootRouteWithContext<RouterContext>()({
    component: () => <Outlet />,
  })
  const accueil = createRoute({
    getParentRoute: () => racine,
    path: '/',
    component: () => <p>Accueil de l’application</p>,
  })
  const consentement = createRoute({
    getParentRoute: () => racine,
    path: '/oauth/consent',
    validateSearch: (s: Record<string, unknown>) => s,
    component: () => <p>Écran de consentement</p>,
  })
  const login = LoginRoute.update({
    id: '/login',
    path: '/login',
    getParentRoute: () => racine,
  } as never)
  const router = createRouter({
    routeTree: racine.addChildren([accueil, consentement, login]),
    history: createMemoryHistory({ initialEntries: [chemin] }),
    context: {
      auth: { session, isLoading: false },
      queryClient: new QueryClient(),
    },
  })
  render(<RouterProvider router={router} />)
  return router
}

async function saisir(email: string, motDePasse: string) {
  const u = userEvent.setup()
  if (email) await u.type(await screen.findByLabelText('Email'), email)
  if (motDePasse)
    await u.type(screen.getByLabelText('Mot de passe'), motDePasse)
  await u.click(screen.getByRole('button', { name: 'Se connecter' }))
}

describe('écran de connexion', () => {
  it('succès : identifiants transmis tels quels, puis redirection vers l’accueil', async () => {
    signIn.mockReset().mockResolvedValue({ data: {}, error: null })
    const router = monter('/login')
    await saisir('jean@exemple.fr', 'Secret!2026')
    await screen.findByText('Accueil de l’application')
    expect(signIn).toHaveBeenCalledWith({
      email: 'jean@exemple.fr',
      password: 'Secret!2026',
    })
    expect(router.state.location.pathname).toBe('/')
  })

  it('succès avec une demande d’autorisation du connecteur : reprise sur /oauth/consent', async () => {
    signIn.mockReset().mockResolvedValue({ data: {}, error: null })
    const router = monter('/login?autorisation=abc_123')
    await saisir('jean@exemple.fr', 'Secret!2026')
    await screen.findByText('Écran de consentement')
    expect(router.state.location.search).toEqual({
      authorization_id: 'abc_123',
    })
  })

  it('autorisation mal formée : COMPORTEMENT ACTUEL — elle est quand même transmise à /oauth/consent', async () => {
    signIn.mockReset().mockResolvedValue({ data: {}, error: null })
    const router = monter('/login?autorisation=https://pirate.example/x')
    await saisir('jean@exemple.fr', 'Secret!2026')
    await screen.findByText('Écran de consentement')
    // La destination reste interne (pas de redirection ouverte), mais la valeur
    // refusée par `validateSearch` passe : TanStack fusionne la recherche BRUTE
    // et la recherche validée, retourner `{}` n'efface donc rien.
    expect(router.state.location.search).toEqual({
      authorization_id: 'https://pirate.example/x',
    })
  })

  it.fails(
    'BUG CANDIDAT : une autorisation mal formée devrait être ignorée (validateSearch qui renvoie {} n’efface pas la valeur brute) et ramener à l’accueil',
    async () => {
      signIn.mockReset().mockResolvedValue({ data: {}, error: null })
      const router = monter('/login?autorisation=https://pirate.example/x')
      await saisir('jean@exemple.fr', 'Secret!2026')
      await waitFor(() =>
        expect(router.state.location.pathname).not.toBe('/login'),
      )
      expect(router.state.location.pathname).toBe('/')
    },
  )

  it('identifiants refusés : message français traduit, on reste sur la page', async () => {
    signIn.mockReset().mockResolvedValue({
      data: {},
      error: Object.assign(new Error('Invalid login credentials'), {
        code: 'invalid_credentials',
      }),
    })
    const router = monter('/login')
    await saisir('jean@exemple.fr', 'mauvais')
    expect(
      await screen.findByText('E-mail ou mot de passe incorrect.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Invalid login/)).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    // Le bouton redevient utilisable après l'échec.
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled()
  })

  it('erreur inconnue : message de repli en français', async () => {
    signIn.mockReset().mockResolvedValue({
      data: {},
      error: Object.assign(new Error('boom'), { code: 'inattendu' }),
    })
    monter('/login')
    await saisir('jean@exemple.fr', 'x')
    expect(
      await screen.findByText(
        'La connexion a échoué. Réessayez dans un instant.',
      ),
    ).toBeInTheDocument()
  })

  it('champs vides : le formulaire est invalide, aucun appel à Supabase', async () => {
    signIn.mockReset()
    monter('/login')
    const email = await screen.findByLabelText('Email')
    const mdp = screen.getByLabelText('Mot de passe')
    expect(email).toBeRequired()
    expect(mdp).toBeRequired()
    await saisir('', '')
    expect(email).toBeInvalid()
    expect(mdp).toBeInvalid()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('mot de passe seul manquant : aucun appel à Supabase', async () => {
    signIn.mockReset()
    monter('/login')
    await saisir('jean@exemple.fr', '')
    expect(screen.getByLabelText('Mot de passe')).toBeInvalid()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('session déjà ouverte : /login redirige vers l’accueil sans afficher le formulaire', async () => {
    const router = monter('/login', {
      access_token: 'jeton',
      user: { id: 'u1' },
    } as unknown as Session)
    await screen.findByText('Accueil de l’application')
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
