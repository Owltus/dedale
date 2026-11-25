import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { ChecklistDialog, type ChecklistItem } from './checklist-dialog'

/**
 * ChecklistDialog (« Lier des gammes », « Importer depuis le commun »…) :
 * sélection initiale, recherche (casse et accents ignorés), compteur du
 * bouton, envoi des ids cochés, modale gardée ouverte sur échec, états
 * chargement / erreur / vide, sélection réamorcée à chaque ouverture.
 */
const ITEMS: ChecklistItem[] = [
  { id: 'g1', titre: 'Éclairage de sécurité', sousTitre: 'Annuel' },
  { id: 'g2', titre: 'Désenfumage', sousTitre: 'Semestriel' },
  { id: 'g3', titre: 'Extincteurs' },
]

function monter(
  props: Partial<Parameters<typeof ChecklistDialog>[0]> & {
    onSubmit?: (ids: string[]) => Promise<unknown>
  } = {},
) {
  const envoyer = vi.fn(props.onSubmit ?? (() => Promise.resolve()))
  function Hote() {
    const [open, setOpen] = useState(true)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Rouvrir
        </button>
        <ChecklistDialog
          title="Lier des gammes"
          items={ITEMS}
          submitLabel={(n) => `Lier (${String(n)})`}
          {...props}
          open={open}
          onOpenChange={setOpen}
          onSubmit={envoyer}
        />
      </>
    )
  }
  render(<Hote />)
  return envoyer
}

const caseDe = (titre: string) =>
  screen.getByRole('checkbox', { name: (n) => n.startsWith(titre) })

describe('ChecklistDialog', () => {
  it('sélection initiale, compteur, envoi des ids cochés puis fermeture', async () => {
    const envoyer = monter({ initialSelected: ['g2'] })
    const u = userEvent.setup()
    expect(caseDe('Désenfumage')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Lier (1)' })).toBeEnabled()
    await u.click(caseDe('Extincteurs'))
    await u.click(caseDe('Désenfumage'))
    await u.click(screen.getByRole('button', { name: 'Lier (1)' }))
    expect(envoyer).toHaveBeenCalledWith(['g3'])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('recherche sur le titre et le sous-titre, accents ignorés ; aucun résultat', async () => {
    monter({ noResults: 'Aucune gamme trouvée.' })
    const u = userEvent.setup()
    const recherche = screen.getByRole('textbox')
    await u.type(recherche, 'eclairage')
    expect(caseDe('Éclairage de sécurité')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Extincteurs/ })).toBeNull()
    await u.clear(recherche)
    await u.type(recherche, 'SEMESTRIEL')
    expect(caseDe('Désenfumage')).toBeInTheDocument()
    await u.clear(recherche)
    await u.type(recherche, 'zzz')
    expect(screen.getByText('Aucune gamme trouvée.')).toBeInTheDocument()
  })

  it('échec de l’envoi : la modale reste ouverte, sélection gardée', async () => {
    const envoyer = monter({ onSubmit: () => Promise.reject(new Error('non')) })
    const u = userEvent.setup()
    await u.click(caseDe('Extincteurs'))
    await u.click(screen.getByRole('button', { name: 'Lier (1)' }))
    expect(envoyer).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(caseDe('Extincteurs')).toBeChecked()
  })

  it('sélection exigée : bouton désactivé sans coche', () => {
    monter({ requireSelection: true })
    expect(screen.getByRole('button', { name: 'Lier (0)' })).toBeDisabled()
  })

  it('chargement, erreur et liste vide', () => {
    const { unmount } = render(
      <ChecklistDialog
        open
        onOpenChange={() => undefined}
        title="Lier"
        items={[]}
        submitLabel={() => 'Lier'}
        onSubmit={() => Promise.resolve()}
        empty="Aucune gamme."
      />,
    )
    expect(screen.getByText('Aucune gamme.')).toBeInTheDocument()
    unmount()
    const r = render(
      <ChecklistDialog
        open
        onOpenChange={() => undefined}
        title="Lier"
        items={ITEMS}
        submitLabel={() => 'Lier'}
        onSubmit={() => Promise.resolve()}
        error={<p>Panne de lecture</p>}
      />,
    )
    expect(screen.getByText('Panne de lecture')).toBeInTheDocument()
    r.unmount()
    render(
      <ChecklistDialog
        open
        onOpenChange={() => undefined}
        title="Lier"
        items={ITEMS}
        submitLabel={() => 'Lier'}
        onSubmit={() => Promise.resolve()}
        loading
      />,
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('« Annuler » ferme ; la réouverture repart de la sélection initiale', async () => {
    monter({ initialSelected: ['g1'] })
    const u = userEvent.setup()
    await u.click(caseDe('Éclairage de sécurité'))
    expect(caseDe('Éclairage de sécurité')).not.toBeChecked()
    await u.click(screen.getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await u.click(screen.getByRole('button', { name: 'Rouvrir' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(caseDe('Éclairage de sécurité')).toBeChecked()
  })
})
