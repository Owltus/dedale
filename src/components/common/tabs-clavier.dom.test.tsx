import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubTabs } from '@/components/common/sub-tabs'
import { Tabs } from '@/components/common/tabs'
import { renderAvecRouteur } from '@/test/harness'

/**
 * Navigation clavier WAI-ARIA des deux barres d'onglets (flèches + Début/Fin,
 * bouclage, roving focus). La logique est partagée : ce test la fige pour
 * chacun des deux composants qui la consomment.
 */

const IDS = ['a', 'b', 'c'] as const

function SubTabsControle({ onChange }: { onChange: (id: string) => void }) {
  const [value, setValue] = useState<string>('c')
  return (
    <SubTabs
      ariaLabel="Sections"
      items={IDS.map((id) => ({ id, label: `Onglet ${id}` }))}
      value={value}
      onValueChange={(id) => {
        onChange(id)
        setValue(id)
      }}
    />
  )
}

function TabsNonControle() {
  return (
    <Tabs
      items={IDS.map((id) => ({
        id,
        label: `Onglet ${id}`,
        labelText: `Onglet ${id}`,
        content: <p>Panneau {id}</p>,
      }))}
    />
  )
}

describe('SubTabs — clavier', () => {
  it('ArrowRight sur le dernier onglet revient au premier', async () => {
    const onChange = vi.fn()
    render(<SubTabsControle onChange={onChange} />)
    const dernier = screen.getByRole('tab', { name: 'Onglet c' })
    dernier.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('a')
    expect(screen.getByRole('tab', { name: 'Onglet a' })).toHaveFocus()
  })

  it('ArrowLeft sur le premier boucle au dernier, End sélectionne le dernier, Home le premier', async () => {
    const onChange = vi.fn()
    render(<SubTabsControle onChange={onChange} />)
    screen.getByRole('tab', { name: 'Onglet c' }).focus()
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('a')
    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('c')
    await userEvent.keyboard('{Home}{End}')
    expect(onChange).toHaveBeenLastCalledWith('c')
    expect(screen.getByRole('tab', { name: 'Onglet c' })).toHaveFocus()
  })

  it('une touche non gérée ne change rien', async () => {
    const onChange = vi.fn()
    render(<SubTabsControle onChange={onChange} />)
    screen.getByRole('tab', { name: 'Onglet c' }).focus()
    await userEvent.keyboard('{ArrowDown}x')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Tabs — clavier', () => {
  it('End sélectionne le dernier, puis ArrowRight revient au premier', async () => {
    renderAvecRouteur(<TabsNonControle />)
    ;(await screen.findByRole('tab', { name: 'Onglet a' })).focus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Onglet c' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Onglet c' })).toHaveFocus()
    expect(screen.getByText('Panneau c')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Onglet a' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Onglet a' })).toHaveFocus()
  })

  it('ArrowLeft sur le premier boucle au dernier ; touche non gérée sans effet', async () => {
    renderAvecRouteur(<TabsNonControle />)
    ;(await screen.findByRole('tab', { name: 'Onglet a' })).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('tab', { name: 'Onglet a' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Onglet c' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
