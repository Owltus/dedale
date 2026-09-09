import { describe, expect, it } from 'vitest'
import { buildImportPrompt, parseImportCsv } from './csv-import'

const ENTETE = 'Libellé;Constat'
const existants = [{ libelle: 'Fuite d’eau' }]

describe('parseImportCsv (modèles de DI)', () => {
  it('exige les deux colonnes', () => {
    const r = parseImportCsv('Nom;Texte\nx;y')
    expect(r.colonnesManquantes).toEqual(['Libellé', 'Constat'])
    expect(r.lignes).toEqual([])
  })

  it('lit un modèle complet, guillemets compris', () => {
    const r = parseImportCsv(
      `${ENTETE}\nÉclairage en panne;"Je constate qu'un éclairage ne fonctionne plus ; merci de préciser le local."`,
    )
    const [l] = r.lignes
    expect(l?.ok).toBe(true)
    if (l?.ok) {
      expect(l.libelle).toBe('Éclairage en panne')
      expect(l.constat).toContain('merci de préciser le local')
    }
  })

  it('refuse une ligne incomplète', () => {
    const r = parseImportCsv(
      [ENTETE, 'Sans constat;', ';Sans libellé'].join('\n'),
    )
    expect(r.lignes.every((l) => !l.ok)).toBe(true)
    const messages = r.lignes.flatMap((l) => (l.ok ? [] : l.erreurs)).join(' ')
    expect(messages).toContain('Constat est obligatoire')
    expect(messages).toContain('Libellé est obligatoire')
  })

  it('ignore un libellé déjà en base, et un doublon interne au CSV', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Fuite d’eau;Je constate une fuite.',
        'Porte bloquée;La porte ne s’ouvre plus.',
        'porte bloquée;Doublon de casse différente.',
      ].join('\n'),
      existants,
    )
    expect(r.lignes[0]?.ok === false && r.lignes[0].ignoree).toBe(true)
    expect(r.lignes[1]?.ok).toBe(true)
    expect(r.lignes[2]?.ok === false && r.lignes[2].ignoree).toBe(true)
  })
})

describe('buildImportPrompt (modèles de DI)', () => {
  it('adapte le texte au périmètre et liste les modèles existants', () => {
    const commun = buildImportPrompt({ existants, portee: 'entreprise' })
    expect(commun).toContain("communs à toute l'entreprise")
    expect(commun).toContain('- Fuite d’eau')

    const site = buildImportPrompt({
      existants: [],
      portee: 'site',
      siteNom: 'Tour A',
    })
    expect(site).toContain('« Tour A »')
  })
})
