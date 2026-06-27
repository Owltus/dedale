import { describe, expect, it } from 'vitest'
import { splitExtension, suggestDocumentName } from './naming'

describe('splitExtension', () => {
  it('sépare une extension connue', () => {
    expect(splitExtension('scan_0042.pdf')).toEqual({
      base: 'scan_0042',
      ext: '.pdf',
    })
  })
  it('gère un nom sans extension', () => {
    expect(splitExtension('document final')).toEqual({
      base: 'document final',
      ext: '',
    })
  })
  it('ne traite pas un point interne comme extension', () => {
    expect(splitExtension('maintenance v1.2 rapport')).toEqual({
      base: 'maintenance v1.2 rapport',
      ext: '',
    })
  })
})

describe('suggestDocumentName', () => {
  it('assemble [Type] - [Prestataire] - [Objet] - [Date]', () => {
    expect(
      suggestDocumentName('Rapport d’intervention', {
        prestataire: 'Soclova',
        objet: 'Maintenance CTA',
        date: '2026-06-27',
      }),
    ).toBe('Rapport d’intervention - Soclova - Maintenance CTA - 27/06/2026')
  })

  it('omet les segments absents', () => {
    expect(
      suggestDocumentName('Devis', { objet: 'Maintenance CTA', date: '2026-06-27' }),
    ).toBe('Devis - Maintenance CTA - 27/06/2026')
  })

  it('omet le type quand il est absent (1er segment = prestataire)', () => {
    expect(
      suggestDocumentName(undefined, {
        prestataire: 'Soclova',
        objet: 'Maintenance CTA',
        date: '2026-06-27',
      }),
    ).toBe('Soclova - Maintenance CTA - 27/06/2026')
  })

  it('retombe sur l’année courante sans date', () => {
    const annee = String(new Date().getFullYear())
    expect(suggestDocumentName('Devis', { objet: 'Maintenance CTA' })).toBe(
      `Devis - Maintenance CTA - ${annee}`,
    )
  })

  it('ignore les chaînes vides ou en blanc', () => {
    expect(
      suggestDocumentName('  ', { prestataire: '', objet: 'CTA', date: '2026-06-27' }),
    ).toBe('CTA - 27/06/2026')
  })
})
