import { describe, expect, it } from 'vitest'
import { lieuxParDi } from './lieux-par-di'

describe('lieuxParDi', () => {
  it('reprend le texte composé par la base, demande par demande', () => {
    const m = lieuxParDi({ a: 'Chambre 214, Chambre 109', c: 'Club' })
    expect([...m]).toEqual([
      ['a', 'Chambre 214, Chambre 109'],
      ['c', 'Club'],
    ])
  })

  it('ignore une valeur vide ou qui n’est pas un texte', () => {
    expect([...lieuxParDi({ a: '', b: null, c: 3, d: 'Hall' })]).toEqual([
      ['d', 'Hall'],
    ])
  })

  it('réponse vide ou inattendue → aucune entrée', () => {
    expect(lieuxParDi(null).size).toBe(0)
    expect(lieuxParDi([]).size).toBe(0)
    expect(lieuxParDi('x').size).toBe(0)
  })
})
