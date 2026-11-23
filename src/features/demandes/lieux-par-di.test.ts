import { describe, expect, it } from 'vitest'
import { lieuxParDi } from './lieux-par-di'

describe('lieuxParDi', () => {
  it('réunit les lieux d’une même demande, sans doublon ni nom vide', () => {
    const m = lieuxParDi([
      { di_id: 'a', locaux: { nom: 'Chambre 214' } },
      { di_id: 'a', locaux: { nom: 'Chambre 109' } },
      { di_id: 'a', locaux: { nom: 'Chambre 214' } },
      { di_id: 'b', locaux: { nom: null } },
      { di_id: 'c', locaux: { nom: 'Club' } },
    ])
    expect([...m]).toEqual([
      ['a', 'Chambre 214, Chambre 109'],
      ['c', 'Club'],
    ])
  })
})
