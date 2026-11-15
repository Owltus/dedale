import { describe, expect, it } from 'vitest'
import { colonnesAccesClaude, niveauAccesClaude } from './acces-claude'

describe('niveauAccesClaude', () => {
  it('désactivé quand la lecture est fermée, quelle que soit l’écriture', () => {
    expect(
      niveauAccesClaude({ acces_ia: false, acces_ia_ecriture: false }),
    ).toBe('aucun')
    expect(
      niveauAccesClaude({ acces_ia: false, acces_ia_ecriture: true }),
    ).toBe('aucun')
  })
  it('lecture seule', () => {
    expect(
      niveauAccesClaude({ acces_ia: true, acces_ia_ecriture: false }),
    ).toBe('lecture')
  })
  it('lecture et modification', () => {
    expect(niveauAccesClaude({ acces_ia: true, acces_ia_ecriture: true })).toBe(
      'ecriture',
    )
  })
})

describe('colonnesAccesClaude', () => {
  it('écrit toujours les deux colonnes, sans jamais l’écriture sans la lecture', () => {
    for (const n of ['aucun', 'lecture', 'ecriture'] as const) {
      const c = colonnesAccesClaude(n)
      expect(!c.acces_ia_ecriture || c.acces_ia).toBe(true)
      expect(niveauAccesClaude(c)).toBe(n)
    }
  })
})
