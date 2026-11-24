import { describe, expect, it } from 'vitest'
import {
  correspondRecherche,
  motifRechercheServeur,
  normaliserRecherche,
} from './recherche'

describe('normaliserRecherche', () => {
  it('retire accents, casse et espaces de bord', () => {
    expect(normaliserRecherche('  Éclairage de SÉCURITÉ ')).toBe(
      'eclairage de securite',
    )
    expect(normaliserRecherche('Contrôle ŒIL çà')).toBe('controle œil ca')
  })
})

describe('correspondRecherche', () => {
  it('recherche vide : tout passe', () => {
    expect(correspondRecherche('', 'x')).toBe(true)
    expect(correspondRecherche('   ')).toBe(true)
  })

  it('insensible aux accents dans les deux sens', () => {
    expect(correspondRecherche('eclairage', 'Éclairage de sécurité')).toBe(true)
    expect(correspondRecherche('sécurité', 'Securite incendie')).toBe(true)
    expect(correspondRecherche('CONTROLE', 'contrôle annuel')).toBe(true)
  })

  it('au moins une valeur suffit ; les valeurs absentes sont ignorées', () => {
    expect(
      correspondRecherche('pompe', null, undefined, 'Pompe de relevage'),
    ).toBe(true)
    expect(correspondRecherche('pompe', null, 'Chaudière')).toBe(false)
  })
})

describe('motifRechercheServeur', () => {
  it('vide → null', () => {
    expect(motifRechercheServeur('  ')).toBeNull()
    expect(motifRechercheServeur('.*()')).toBeNull()
  })

  it('remplace chaque voyelle/ç/ñ/y par sa classe de variantes, entre guillemets', () => {
    expect(motifRechercheServeur('Sécu')).toBe(
      '"s[eéèêëEÉÈÊË][cçCÇ][uùûüúUÙÛÜÚ]"',
    )
  })

  it('retire les caractères spéciaux regex et PostgREST', () => {
    expect(motifRechercheServeur('a.b*(c),"d"')).toBe(
      '"[aàâäáãåAÀÂÄÁÃÅ]b[cçCÇ]d"',
    )
  })
})
