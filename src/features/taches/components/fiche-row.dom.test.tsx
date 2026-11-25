import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HardHat } from 'lucide-react'
import type { DocumentMeta } from '@/features/documents/format'
import { FicheRow, lieuPrincipalTexte } from './fiche-row'

/**
 * Ligne d'une fiche à tâches (Travaux, Événement) : sous-titre, statut et date,
 * icône documents (un → aperçu direct, plusieurs → modale de choix), clic de
 * la ligne et lieu principal en texte. Aucune lecture réseau n'est attendue.
 */
vi.mock('@/lib/supabase', () => {
  const chaine: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_c, m: string) =>
        m === 'then'
          ? (ok: (v: unknown) => unknown) => ok({ data: [], error: null })
          : () => chaine,
    },
  )
  return {
    supabase: {
      from: () => chaine,
      rpc: () => chaine,
      storage: { from: () => chaine },
    },
  }
})

const doc = (id: string, nom: string): DocumentMeta => ({
  id,
  nom_original: nom,
  mime_type: 'application/pdf',
  taille_octets: 1024,
  type_document_id: 1,
  storage_path: `site/${id}.pdf`,
  uploaded_at: '2026-11-01T10:00:00Z',
})

function monter(documents: DocumentMeta[], onClick = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  render(
    <QueryClientProvider client={qc}>
      <FicheRow
        icon={HardHat}
        tone="info"
        titre="Remplacer la porte"
        sousTitre="Chambre 214 · Porte voilée"
        statutLabel="En cours"
        date="2026-11-20"
        documents={documents}
        onClick={onClick}
      />
    </QueryClientProvider>,
  )
  return onClick
}

describe('FicheRow', () => {
  it('rend titre, sous-titre, statut et date ; le clic ouvre la fiche', async () => {
    const onClick = monter([])
    expect(screen.getByText('Remplacer la porte')).toBeInTheDocument()
    expect(screen.getByText('Chambre 214 · Porte voilée')).toBeInTheDocument()
    expect(screen.getAllByText('En cours').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Voir le/ })).toBeNull()
    const [ligne] = screen.getAllByRole('button', {
      name: 'Remplacer la porte',
    })
    if (!ligne) throw new Error('ligne absente')
    await userEvent.setup().click(ligne)
    expect(onClick).toHaveBeenCalled()
  })

  it('plusieurs documents : l’icône ouvre la modale de choix', async () => {
    monter([doc('d-1', 'devis.pdf'), doc('d-2', 'facture.pdf')])
    const [icone] = screen.getAllByRole('button', {
      name: 'Voir les documents',
    })
    if (!icone) throw new Error('icône absente')
    await userEvent.setup().click(icone)
    expect(
      await screen.findByText('Documents — Remplacer la porte'),
    ).toBeInTheDocument()
  })

  it('un document : l’icône ouvre son aperçu direct', async () => {
    monter([doc('d-1', 'devis.pdf')])
    const [icone] = screen.getAllByRole('button', { name: 'Voir le document' })
    if (!icone) throw new Error('icône absente')
    await userEvent.setup().click(icone)
    expect((await screen.findAllByText(/devis/)).length).toBeGreaterThan(0)
  })
})

describe('lieuPrincipalTexte', () => {
  it('local et équipement, repli « Équipement », vide sans lieu', () => {
    expect(
      lieuPrincipalTexte({
        locaux: { id: 'l', nom: 'Chambre 214' },
        equipements: { id: 'e', categories: { nom: 'Climatiseur' } },
      }),
    ).toBe('Chambre 214 · Climatiseur')
    expect(
      lieuPrincipalTexte({
        locaux: null,
        equipements: { id: 'e', categories: null },
      }),
    ).toBe('Équipement')
    expect(lieuPrincipalTexte({ locaux: null, equipements: null })).toBe('')
  })
})
