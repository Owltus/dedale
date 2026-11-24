import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErreurDeRendu } from './erreur-de-rendu'

const invalidate = vi.fn(() => Promise.resolve())
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate }),
}))

describe('ErreurDeRendu', () => {
  it('message en français ; « Réessayer » relit les données et remonte la page', () => {
    const reset = vi.fn()
    render(<ErreurDeRendu error={new Error('boum')} reset={reset} />)
    expect(
      screen.getByText('Cette page a rencontré un problème inattendu.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(invalidate).toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
  })
})
