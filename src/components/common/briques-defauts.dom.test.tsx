import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAvecRouteur } from '@/test/harness'
import type { DocumentMeta } from '@/features/documents/format'
import { PageHeader } from './page-header'
import { ScopeSelect } from './scope-select'
import { Tabs } from './tabs'
import { DocumentsListe } from '@/features/documents/components/documents-liste'
import { MotifDialog } from './motif-dialog'
import { TooltipIconButton } from './tooltip-icon-button'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Comportements PAR DÉFAUT des briques communes (ceux que tous les appelants
 * obtiennent) : libellé « Retour », option « Commun », premier onglet actif,
 * aperçu interne au clic d'un document, champ « Motif » sur 4 lignes, bouton
 * de type `button`.
 */

vi.mock('@/lib/site-context', () => ({
  useSiteContext: () => ({
    sites: [{ id: 's1', nom: 'Site A' }],
  }),
}))

vi.mock('@/features/documents/use-document-download', () => ({
  useDocumentDownload: () => () => Promise.resolve(),
}))

vi.mock('@/features/documents/components/document-preview-dialog', () => ({
  DocumentPreviewDialog: ({ doc }: { doc: DocumentMeta | null }) =>
    doc === null ? null : <div role="dialog">Aperçu {doc.nom_original}</div>,
}))

vi.mock('@/features/documents/components/document-edit-dialog', () => ({
  DocumentEditDialog: () => null,
}))

const DOC: DocumentMeta = {
  id: 'd1',
  nom_original: 'rapport.pdf',
  mime_type: 'application/pdf',
  taille_octets: 1024,
  type_document_id: 1,
  storage_path: 's1/d1.pdf',
  uploaded_at: '2026-01-05T10:00:00Z',
}

describe('PageHeader', () => {
  it('bouton de repli libellé « Retour », qui appelle onBack', async () => {
    const onBack = vi.fn()
    renderAvecRouteur(<PageHeader title="Fiche" onBack={onBack} />)
    const bouton = await screen.findByRole('button', { name: 'Retour' })
    await userEvent.click(bouton)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('ScopeSelect', () => {
  it('propose « Commun » en premier, puis les sites', () => {
    render(<ScopeSelect value="s1" onChange={() => undefined} />)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Commun', 'Site A'])
  })
})

describe('Tabs', () => {
  it('non contrôlé : le premier onglet est actif', async () => {
    renderAvecRouteur(
      <Tabs
        items={[
          { id: 'a', label: 'Alpha', labelText: 'Alpha', content: 'corps A' },
          { id: 'b', label: 'Bêta', labelText: 'Bêta', content: 'corps B' },
        ]}
      />,
    )
    const alpha = await screen.findByRole('tab', { name: 'Alpha' })
    expect(alpha).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('corps A')).toBeInTheDocument()
    expect(screen.queryByText('corps B')).toBeNull()
  })
})

describe('DocumentsListe', () => {
  it('clic sur une ligne : ouvre l’aperçu interne', async () => {
    render(<DocumentsListe docs={[DOC]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'rapport.pdf' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Aperçu rapport.pdf')
  })
})

describe('MotifDialog', () => {
  it('champ libellé « Motif », sur 4 lignes', () => {
    render(
      <MotifDialog
        open
        onOpenChange={() => undefined}
        title="Annuler"
        description="Pourquoi ?"
        confirmLabel="Confirmer"
        pending={false}
        onConfirm={() => undefined}
      />,
    )
    const champ = screen.getByRole('textbox', { name: /Motif/ })
    expect(champ).toHaveAttribute('rows', '4')
  })
})

describe('TooltipIconButton', () => {
  it('bouton de type « button » (ne soumet jamais un formulaire)', () => {
    render(
      <TooltipProvider>
        <TooltipIconButton icon={<span />} label="Ajouter" />
      </TooltipProvider>,
    )
    expect(screen.getByRole('button', { name: 'Ajouter' })).toHaveAttribute(
      'type',
      'button',
    )
  })
})
