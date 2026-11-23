import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ModeleDiSelect } from './modele-di-select'

vi.mock('@/features/miniatures/use-miniature-urls', () => ({
  useMiniatureUrls: () => ({ urlOf: () => null, refresh: () => undefined }),
}))

const MODELES = [
  { id: 'm1', libelle: 'Fuite', constat_modele: '', miniature_id: null },
]

/** Gel du « clic hors du composant » : il referme la liste, un clic dedans non. */
describe('ModeleDiSelect — clic extérieur', () => {
  it('un mousedown hors du composant referme la liste, un mousedown dedans non', () => {
    render(<ModeleDiSelect modeles={MODELES} value="" onChange={vi.fn()} />)
    const declencheur = screen.getByRole('combobox')
    fireEvent.click(declencheur)
    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.mouseDown(screen.getByText('Fuite'))
    expect(screen.queryByRole('listbox')).not.toBeNull()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(declencheur.getAttribute('aria-expanded')).toBe('false')
  })
})
