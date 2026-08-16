import { describe, expect, it } from 'vitest'
import {
  PASSWORD_REGLES,
  creerCompteSchema,
  octetsDe,
  passwordAvecConfirmation,
  passwordSchema,
} from './schemas'

/** Mot de passe conforme aux cinq règles, utilisé comme base des variantes. */
const VALIDE = 'Chantier2026!'

function regle(libelle: string) {
  const r = PASSWORD_REGLES.find((x) => x.libelle === libelle)
  if (!r) throw new Error(`Règle introuvable : ${libelle}`)
  return r
}

describe('PASSWORD_REGLES', () => {
  it('exige 12 caractères, et pince la borne', () => {
    const r = regle('12 caractères au minimum')
    expect(r.test('Abcdef1!')).toBe(false) // 8
    // 11 : la valeur juste en dessous. Sans ce cas, le test passerait tel quel
    // si la règle disait 9, 10 ou 11 — or c'est précisément le seuil qu'il
    // prétend garantir.
    expect(r.test('Abcdefgh12!')).toBe(false) // 11
    expect(r.test('Abcdefgh123!')).toBe(true) // 12
  })

  it('exige une majuscule, accents compris', () => {
    const r = regle('une majuscule')
    expect(r.test('chantier2026!')).toBe(false)
    expect(r.test('Chantier2026!')).toBe(true)
    expect(r.test('Étanchéité2026!')).toBe(true)
  })

  it('exige une minuscule, accents compris', () => {
    const r = regle('une minuscule')
    expect(r.test('CHANTIER2026!')).toBe(false)
    expect(r.test('CHANTIERé2026!')).toBe(true)
  })

  it('exige un chiffre', () => {
    const r = regle('un chiffre')
    expect(r.test('ChantierNeuf!')).toBe(false)
    expect(r.test('ChantierNeuf1')).toBe(true)
  })

  it('exige un caractère spécial, sans compter les lettres accentuées', () => {
    const r = regle('un caractère spécial')
    // Piège : « é » est une lettre, pas un caractère spécial. Si la classe de
    // caractères oubliait la plage accentuée, ce test passerait à tort.
    expect(r.test('Chantierété2026')).toBe(false)
    expect(r.test('Chantier2026!')).toBe(true)
    expect(r.test('Chantier 2026a')).toBe(true) // l'espace compte
  })
})

describe('passwordSchema', () => {
  it('accepte un mot de passe conforme', () => {
    expect(passwordSchema.safeParse(VALIDE).success).toBe(true)
  })

  it('refuse dès qu’une seule règle manque', () => {
    expect(passwordSchema.safeParse('chantier2026!').success).toBe(false) // pas de majuscule
    expect(passwordSchema.safeParse('Chantier!!!!').success).toBe(false) // pas de chiffre
    expect(passwordSchema.safeParse('Chantier2026').success).toBe(false) // pas de spécial
    expect(passwordSchema.safeParse('Chant2026!').success).toBe(false) // 10 caractères
  })

  it('accepte 72 octets et refuse au-delà', () => {
    const a71 = `${'A'.repeat(68)}a1!x` // 72 caractères ASCII = 72 octets
    expect(octetsDe(a71)).toBe(72)
    expect(passwordSchema.safeParse(a71).success).toBe(true)
    expect(passwordSchema.safeParse(`${a71}z`).success).toBe(false)
  })

  it('mesure la limite en OCTETS, pas en caractères', () => {
    // Un emoji pèse 4 octets en UTF-8 mais ne compte que 2 dans `.length`
    // (paire de substitution UTF-16). 20 emoji + 4 caractères = 44 pour
    // `.length`, mais 84 octets : une borne posée sur `.length` laisserait
    // passer ce mot de passe, que bcrypt tronquerait silencieusement à 72.
    const emoji = `${'🔧'.repeat(20)}Aa1!`
    expect(emoji.length).toBeLessThan(72)
    expect(octetsDe(emoji)).toBeGreaterThan(72)
    expect(passwordSchema.safeParse(emoji).success).toBe(false)
  })
})

describe('passwordAvecConfirmation', () => {
  it('accepte deux saisies identiques', () => {
    const r = passwordAvecConfirmation.safeParse({
      password: VALIDE,
      password_confirm: VALIDE,
    })
    expect(r.success).toBe(true)
  })

  it('signale la divergence SOUS le champ de confirmation', () => {
    const r = passwordAvecConfirmation.safeParse({
      password: VALIDE,
      password_confirm: `${VALIDE}x`,
    })
    expect(r.success).toBe(false)
    // Le chemin est ce qui fait apparaître le message sous le bon champ : sans
    // lui, l'erreur se pose à la racine et le formulaire refuse de se soumettre
    // sans rien afficher.
    expect(r.error?.issues[0]?.path).toEqual(['password_confirm'])
  })
})

describe('creerCompteSchema', () => {
  const base = {
    email: 'jean@exemple.fr',
    nom_complet: 'Jean Dupont',
    role: 'technicien' as const,
    site_ids: [],
    password: VALIDE,
    password_confirm: VALIDE,
  }

  it('accepte un formulaire complet et conforme', () => {
    expect(creerCompteSchema.safeParse(base).success).toBe(true)
  })

  it('refuse un mot de passe faible, même saisi deux fois à l’identique', () => {
    const r = creerCompteSchema.safeParse({
      ...base,
      password: 'court1!',
      password_confirm: 'court1!',
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'password')).toBe(true)
  })

  it('signale la divergence SOUS le champ de confirmation', () => {
    const r = creerCompteSchema.safeParse({
      ...base,
      password_confirm: `${VALIDE}x`,
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'password_confirm')).toBe(
      true,
    )
  })

  it('détoure l’e-mail AVANT de le valider', () => {
    // Coller une adresse depuis un tableur amène une espace : elle doit être
    // nettoyée, pas rejetée comme « invalide ».
    const r = creerCompteSchema.safeParse({
      ...base,
      email: '  jean@exemple.fr ',
    })
    expect(r.success).toBe(true)
    expect(r.data?.email).toBe('jean@exemple.fr')
  })
})
