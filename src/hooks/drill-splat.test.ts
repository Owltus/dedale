import { describe, expect, it } from 'vitest'
import { joinSplat, splatCatSegs } from './drill-splat'

describe('splatCatSegs', () => {
  it('découpe un splat en segments, sans les vides', () => {
    expect(splatCatSegs('cvc/chaudieres', false)).toEqual(['cvc', 'chaudieres'])
    expect(splatCatSegs('cvc//chaudieres/', false)).toEqual([
      'cvc',
      'chaudieres',
    ])
  })

  it('retourne un tableau vide pour undefined ou chaîne vide', () => {
    expect(splatCatSegs(undefined, false)).toEqual([])
    expect(splatCatSegs('', false)).toEqual([])
    expect(splatCatSegs(undefined, true)).toEqual([])
  })

  it('retire le préfixe (onglet) quand stripPrefix est vrai', () => {
    expect(splatCatSegs('modeles/cvc/chaudieres', true)).toEqual([
      'cvc',
      'chaudieres',
    ])
    // Un seul segment (l'onglet seul) → chemin de catégories vide.
    expect(splatCatSegs('modeles', true)).toEqual([])
  })
})

describe('joinSplat', () => {
  it('assemble préfixe + segments + feuille', () => {
    expect(joinSplat([], ['cvc', 'chaudieres'], 'gamme-x')).toBe(
      'cvc/chaudieres/gamme-x',
    )
    expect(joinSplat(['modeles'], ['cvc'], 'equip-y')).toBe(
      'modeles/cvc/equip-y',
    )
  })

  it('omet la feuille quand elle est undefined', () => {
    expect(joinSplat([], ['cvc', 'chaudieres'], undefined)).toBe(
      'cvc/chaudieres',
    )
    expect(joinSplat(['modeles'], [], undefined)).toBe('modeles')
  })

  it('symétrie avec splatCatSegs (aller-retour sans préfixe)', () => {
    const segs = ['cvc', 'chaudieres', 'gaz']
    expect(splatCatSegs(joinSplat([], segs, undefined), false)).toEqual(segs)
  })
})
