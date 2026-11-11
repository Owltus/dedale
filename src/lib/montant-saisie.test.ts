import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { nettoyerMontant } from './montant-saisie'

describe('nettoyerMontant — un champ montant ne garde qu’un montant', () => {
  it('laisse passer un montant déjà propre', () => {
    expect(nettoyerMontant('1222')).toBe('1222')
    expect(nettoyerMontant('1222,5')).toBe('1222,5')
    expect(nettoyerMontant('1222.50')).toBe('1222.50')
    expect(nettoyerMontant('')).toBe('')
  })

  it('retire lettres, symbole et espaces (montant collé)', () => {
    expect(nettoyerMontant('1 222,00 €')).toBe('1222,00')
    expect(nettoyerMontant('abc')).toBe('')
    expect(nettoyerMontant('12a3')).toBe('123')
    expect(nettoyerMontant('-50')).toBe('50')
  })

  it('un seul séparateur, deux décimales au plus', () => {
    expect(nettoyerMontant('12,3,4')).toBe('12,34')
    expect(nettoyerMontant('12,345')).toBe('12,34')
    expect(nettoyerMontant('1.2.3')).toBe('1.23')
  })

  it('le résultat est toujours un montant (chiffres, au plus un séparateur, 2 décimales)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(nettoyerMontant(s)).toMatch(/^\d*([.,]\d{0,2})?$/)
      }),
      { numRuns: 1000, seed: 42 },
    )
  })

  it('nettoyer deux fois ne change plus rien', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const une = nettoyerMontant(s)
        expect(nettoyerMontant(une)).toBe(une)
      }),
      { numRuns: 1000, seed: 42 },
    )
  })
})
