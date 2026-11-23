import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LocalSearchSelect } from './local-search-select'

vi.mock('../queries', () => ({
  equipementsQueries: {
    locaux: () => ({
      queryKey: ['test-locaux'],
      queryFn: () => [
        {
          local_id: 'l1',
          local_nom: 'Couloir',
          batiment_id: 'b1',
          batiment_nom: 'Bât. A',
          niveau_nom: 'RDC',
        },
      ],
    }),
  },
}))

/** Gel du « clic hors du composant » : il referme la liste, un clic dedans non. */
describe('LocalSearchSelect — clic extérieur', () => {
  it('un mousedown hors du composant referme la liste, un mousedown dedans non', async () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <LocalSearchSelect siteId="s1" value="" onChange={vi.fn()} />
      </QueryClientProvider>,
    )
    const champ = screen.getByRole('combobox')
    fireEvent.change(champ, { target: { value: 'cou' } })
    expect(await screen.findByText('Couloir')).toBeTruthy()

    fireEvent.mouseDown(champ)
    expect(screen.queryByRole('listbox')).not.toBeNull()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(champ.getAttribute('aria-expanded')).toBe('false')
  })
})
