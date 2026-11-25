import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnexionsClaudeCard } from './connexions-claude-card'

/**
 * Carte « Connexions Claude » du profil : liste des applications autorisées,
 * retrait d'une connexion (révocation Supabase Auth), et silence total tant
 * qu'il n'y a rien à montrer. Comportement ACTUEL.
 */
const sb = vi.hoisted(() => ({ lister: vi.fn(), revoquer: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { oauth: { listGrants: sb.lister, revokeGrant: sb.revoquer } },
  },
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const GRANT = {
  client: { id: 'client-1', name: 'Claude' },
  granted_at: '2026-11-20T10:00:00Z',
}

function monter() {
  sb.lister.mockClear()
  sb.revoquer.mockReset()
  toast.success.mockReset()
  toast.error.mockReset()
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidations = vi.spyOn(qc, 'invalidateQueries')
  const rendu = render(
    <QueryClientProvider client={qc}>
      <ConnexionsClaudeCard />
    </QueryClientProvider>,
  )
  return { ...rendu, invalidations }
}

describe('ConnexionsClaudeCard', () => {
  it('aucune connexion : rien n’est rendu', async () => {
    sb.lister.mockResolvedValue({ data: [], error: null })
    const { container } = monter()
    await waitFor(() => expect(sb.lister).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('serveur OAuth en erreur : rien n’est rendu (pas de message)', async () => {
    sb.lister.mockResolvedValue({ data: null, error: new Error('indispo') })
    const { container } = monter()
    await waitFor(() => expect(sb.lister).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('connexions listées : nom (ou « Application inconnue ») et date d’autorisation', async () => {
    sb.lister.mockResolvedValue({
      data: [
        GRANT,
        { client: { id: 'client-2', name: '' }, granted_at: GRANT.granted_at },
      ],
      error: null,
    })
    monter()
    expect(await screen.findByText('Connexions Claude')).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Application inconnue')).toBeInTheDocument()
    expect(screen.getAllByText(/^Autorisée le /)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(2)
  })

  it('retirer : révocation par identifiant client, toast de succès, liste invalidée', async () => {
    sb.lister.mockResolvedValue({ data: [GRANT], error: null })
    const { invalidations } = monter()
    sb.revoquer.mockResolvedValue({ error: null })
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Retirer' }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Connexion retirée', {
        description: 'Claude n’a plus accès à Dédale avec ce compte.',
      }),
    )
    expect(sb.revoquer).toHaveBeenCalledWith({ clientId: 'client-1' })
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: ['connexions-claude'],
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('retirer en cours : boutons désactivés', async () => {
    sb.lister.mockResolvedValue({ data: [GRANT], error: null })
    monter()
    sb.revoquer.mockReturnValue(new Promise(() => undefined))
    const retirer = await screen.findByRole('button', { name: 'Retirer' })
    await userEvent.setup().click(retirer)
    await waitFor(() => expect(retirer).toBeDisabled())
  })

  it('retirer refusé : toast d’erreur traduit, pas de succès', async () => {
    sb.lister.mockResolvedValue({ data: [GRANT], error: null })
    monter()
    sb.revoquer.mockResolvedValue({
      error: Object.assign(new Error('refus'), { code: '42501' }),
    })
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Retirer' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Action impossible : élément hors de votre périmètre, ou déjà modifié.',
      ),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })
})
