import { describe, expect, it } from 'vitest'
import { segOfUnique, slugify } from './slug'

describe('slugify', () => {
  it('décompose et retire les accents (NFD → ascii)', () => {
    expect(slugify('Sécurité incendie')).toBe('securite-incendie')
    expect(slugify('Électricité')).toBe('electricite')
    expect(slugify('àâäéèêëîïôöùûüç')).toBe('aaaeeeeiioouuuc')
  })

  it('passe en minuscules et remplace les espaces par des tirets', () => {
    expect(slugify('Visite Annuelle')).toBe('visite-annuelle')
    expect(slugify('DEUX MOTS')).toBe('deux-mots')
  })

  it('regroupe toute suite de caractères non [a-z0-9] en un seul tiret', () => {
    expect(slugify('a   b')).toBe('a-b')
    expect(slugify('a___b')).toBe('a-b')
    expect(slugify('a / b . c')).toBe('a-b-c')
    expect(slugify("l'eau, c'est bien")).toBe('l-eau-c-est-bien')
  })

  it('élague les tirets de bordure', () => {
    expect(slugify('  bonjour  ')).toBe('bonjour')
    expect(slugify('---test---')).toBe('test')
    expect(slugify('!! Alarme !!')).toBe('alarme')
  })

  it('conserve les chiffres', () => {
    expect(slugify('Niveau 2')).toBe('niveau-2')
    expect(slugify('Local B12')).toBe('local-b12')
  })

  it('renvoie une chaîne vide quand aucun caractère [a-z0-9] (contrat)', () => {
    expect(slugify('')).toBe('')
    expect(slugify('###')).toBe('')
    expect(slugify('①')).toBe('')
    expect(slugify('   ')).toBe('')
    expect(slugify('€ @ #')).toBe('')
  })
})

describe('segOfUnique', () => {
  it('renvoie le slug pur quand il est non vide et sans collision', () => {
    const obj = { nom: 'Sécurité incendie', id: 'aaaaaaaa-1111-2222-3333-444444444444' }
    const siblings = [
      obj,
      { nom: 'Électricité', id: 'bbbbbbbb-1111-2222-3333-444444444444' },
    ]
    expect(segOfUnique(obj, siblings)).toBe('securite-incendie')
  })

  it("retombe sur l'id quand le slug est vide (nom sans caractère [a-z0-9])", () => {
    const obj = { nom: '###', id: 'cccccccc-1111-2222-3333-444444444444' }
    expect(segOfUnique(obj, [obj])).toBe('cccccccc-1111-2222-3333-444444444444')
  })

  it('suffixe ~<id court> en cas de collision entre frères homonymes', () => {
    const a = { nom: 'Électricité', id: 'aaaaaaaa-1111-2222-3333-444444444444' }
    const b = { nom: 'Electricite', id: 'bbbbbbbb-1111-2222-3333-444444444444' }
    const siblings = [a, b]
    // Même slug « electricite » pour les deux → chacun est désambiguïsé.
    expect(segOfUnique(a, siblings)).toBe('electricite~aaaaaaaa')
    expect(segOfUnique(b, siblings)).toBe('electricite~bbbbbbbb')
  })

  it('utilise les 8 premiers caractères de l’id comme discriminant', () => {
    const a = { nom: 'Pompe', id: 'deadbeef-cafe-0000-0000-000000000000' }
    const b = { nom: 'Pompe', id: 'feedface-babe-0000-0000-000000000000' }
    expect(segOfUnique(a, [a, b])).toBe('pompe~deadbeef')
    expect(segOfUnique(b, [a, b])).toBe('pompe~feedface')
  })

  it("n'est pas en collision avec lui-même (même id exclu du test)", () => {
    // Un seul élément : aucun frère homonyme distinct → slug pur.
    const obj = { nom: 'Pompe', id: 'aaaaaaaa-1111-2222-3333-444444444444' }
    expect(segOfUnique(obj, [obj])).toBe('pompe')
  })

  it('ne considère pas comme collision un frère au slug différent', () => {
    const a = { nom: 'Pompe', id: 'aaaaaaaa-1111-2222-3333-444444444444' }
    const b = { nom: 'Vanne', id: 'bbbbbbbb-1111-2222-3333-444444444444' }
    expect(segOfUnique(a, [a, b])).toBe('pompe')
  })

  it('détecte la collision même si l’objet n’est pas présent dans siblings', () => {
    const obj = { nom: 'Pompe', id: 'aaaaaaaa-1111-2222-3333-444444444444' }
    const jumeau = { nom: 'Pompe', id: 'bbbbbbbb-1111-2222-3333-444444444444' }
    expect(segOfUnique(obj, [jumeau])).toBe('pompe~aaaaaaaa')
  })

  it('gère plus de deux frères homonymes', () => {
    const a = { nom: 'Ronde', id: 'aaaaaaaa-0000-0000-0000-000000000000' }
    const b = { nom: 'Ronde', id: 'bbbbbbbb-0000-0000-0000-000000000000' }
    const c = { nom: 'Ronde', id: 'cccccccc-0000-0000-0000-000000000000' }
    const fam = [a, b, c]
    expect(segOfUnique(a, fam)).toBe('ronde~aaaaaaaa')
    expect(segOfUnique(b, fam)).toBe('ronde~bbbbbbbb')
    expect(segOfUnique(c, fam)).toBe('ronde~cccccccc')
  })

  it('symétrie génération/résolution : un segment se relit vers le bon frère', () => {
    // Génération : on calcule le segment de chaque frère.
    const a = { nom: 'Électricité', id: 'aaaaaaaa-1111-2222-3333-444444444444' }
    const b = { nom: 'Electricite', id: 'bbbbbbbb-1111-2222-3333-444444444444' }
    const c = { nom: 'Plomberie', id: 'cccccccc-1111-2222-3333-444444444444' }
    const siblings = [a, b, c]

    // Résolution : on retrouve chaque objet par son segment (même ensemble).
    const resoudre = (seg: string) =>
      siblings.find((x) => segOfUnique(x, siblings) === seg)

    expect(resoudre(segOfUnique(a, siblings))).toBe(a)
    expect(resoudre(segOfUnique(b, siblings))).toBe(b)
    expect(resoudre(segOfUnique(c, siblings))).toBe(c)
  })

  it('les segments d’un même ensemble de frères sont tous distincts', () => {
    const siblings = [
      { nom: 'Électricité', id: 'aaaaaaaa-1111-2222-3333-444444444444' },
      { nom: 'Electricite', id: 'bbbbbbbb-1111-2222-3333-444444444444' },
      { nom: 'Plomberie', id: 'cccccccc-1111-2222-3333-444444444444' },
      { nom: '###', id: 'dddddddd-1111-2222-3333-444444444444' },
    ]
    const segments = siblings.map((x) => segOfUnique(x, siblings))
    expect(new Set(segments).size).toBe(segments.length)
  })
})
