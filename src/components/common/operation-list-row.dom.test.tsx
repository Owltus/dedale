import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { OperationListRow } from './operation-list-row'

describe('OperationListRow — densité', () => {
  // ORACLE : documenté dans le composant — « ligne fine (`h-12`) ». La hauteur
  // vient de la densité `fine` de ListRow, pas de la hauteur média par défaut.
  it('rend une ligne fine (h-12) et non la hauteur par défaut (h-20)', () => {
    const { container } = render(
      <OperationListRow
        nom="Contrôle visuel"
        typeLibelle="Contrôle"
        necessiteSeuils={false}
        seuilMin={null}
        seuilMax={null}
      />,
    )
    const card = container.firstElementChild
    if (!(card instanceof HTMLElement)) throw new Error('Aucune card rendue')
    expect(card).toHaveClass('h-12')
    expect(card).not.toHaveClass('h-20')
  })
})
