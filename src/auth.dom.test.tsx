import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from './auth'

/**
 * Connexion — l'état de session tenu par `AuthProvider` : restauration au
 * démarrage, suivi des changements (connexion, rafraîchissement, déconnexion)
 * et purge du cache à la déconnexion (sinon le compte suivant hérite du rôle et
 * des listes du précédent).
 */
type Ecouteur = (evenement: AuthChangeEvent, session: Session | null) => void

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  desabonner: vi.fn(),
  ecouteur: null as Ecouteur | null,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: auth.onAuthStateChange,
    },
  },
}))

const session = (id: string) =>
  ({ access_token: `jeton-${id}`, user: { id } }) as unknown as Session

function preparer(sessionInitiale: Session | null) {
  auth.ecouteur = null
  auth.desabonner.mockReset()
  auth.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: sessionInitiale }, error: null })
  auth.onAuthStateChange.mockReset().mockImplementation((cb: Ecouteur) => {
    auth.ecouteur = cb
    return { data: { subscription: { unsubscribe: auth.desabonner } } }
  })
  const qc = new QueryClient()
  const purge = vi.spyOn(qc, 'clear')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
  return { qc, purge, wrapper }
}

function emettre(evenement: AuthChangeEvent, s: Session | null) {
  act(() => auth.ecouteur!(evenement, s))
}

describe('AuthProvider', () => {
  it('démarre en chargement, puis restaure la session stockée', async () => {
    const { wrapper } = preparer(session('u1'))
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.session).toBeNull()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session?.user.id).toBe('u1')
    expect(auth.getSession).toHaveBeenCalledTimes(1)
  })

  it('sans session stockée : chargement terminé, session nulle', async () => {
    const { wrapper } = preparer(null)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session).toBeNull()
  })

  it('connexion puis rafraîchissement du jeton : la session suit, le cache est GARDÉ', async () => {
    const { wrapper, purge } = preparer(null)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    emettre('SIGNED_IN', session('u2'))
    expect(result.current.session?.user.id).toBe('u2')
    emettre('TOKEN_REFRESHED', session('u2-bis'))
    expect(result.current.session?.access_token).toBe('jeton-u2-bis')
    expect(purge).not.toHaveBeenCalled()
  })

  it('déconnexion : session nulle ET cache TanStack Query purgé', async () => {
    const { wrapper, purge, qc } = preparer(session('u1'))
    qc.setQueryData(['current_role'], 'admin')
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.session).not.toBeNull())

    emettre('SIGNED_OUT', null)
    expect(result.current.session).toBeNull()
    expect(purge).toHaveBeenCalledTimes(1)
    expect(qc.getQueryData(['current_role'])).toBeUndefined()
  })

  it('démontage : l’abonnement aux changements est résilié', async () => {
    const { wrapper } = preparer(null)
    const { unmount, result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
    expect(auth.desabonner).toHaveBeenCalledTimes(1)
  })

  it('les enfants sont rendus pendant la restauration', () => {
    const { wrapper: Enveloppe } = preparer(null)
    render(
      <Enveloppe>
        <p>contenu</p>
      </Enveloppe>,
    )
    expect(screen.getByText('contenu')).toBeInTheDocument()
  })
})

describe('useAuth', () => {
  it('hors de <AuthProvider> : erreur explicite en français', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth doit être utilisé à l’intérieur de <AuthProvider>',
    )
  })
})
