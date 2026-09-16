import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MESSAGE_DATE_INVALIDE,
  dateFacultative,
  dateObligatoire,
  estDateNue,
} from './dates-zod'
import {
  RUNS,
  arbChaineHostile,
  arbDateIso,
  rejette,
} from './hostile-inputs.test'

/**
 * ORACLE : les colonnes DATE de la base n'acceptent qu'une date nue RÉELLE
 * (`YYYY-MM-DD`, calendrier compris) ; tout le reste revient en `22007`
 * (invalid_datetime_format) ou `22008` (datetime_field_overflow). Le helper est
 * la seule barrière du front avant l'écriture.
 */

describe('estDateNue', () => {
  it('accepte toute date nue produite par le calendrier', () => {
    fc.assert(
      fc.property(arbDateIso(), (iso) => {
        expect(estDateNue(iso)).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse ce qui n’a pas la forme `YYYY-MM-DD`', () => {
    for (const texte of [
      '',
      '12/03/2026',
      '2026-3-12',
      '26-03-12',
      '2026-03-12T00:00:00Z',
      ' 2026-03-12',
      '2026-03-12 ',
      'demain',
      '<script>alert(1)</script>',
    ]) {
      expect(estDateNue(texte)).toBe(false)
    }
  })

  it('refuse une date bien formée mais INEXISTANTE au calendrier', () => {
    // Postgres les refuse aussi (22008) : autant ne pas faire l'aller-retour.
    for (const texte of [
      '2026-00-10',
      '2026-13-45',
      '2026-02-30',
      '2026-02-29', // 2026 n'est pas bissextile
      '2026-04-31',
      '2026-01-00',
      '0000-00-00',
    ]) {
      expect(estDateNue(texte)).toBe(false)
    }
  })

  it('suit la règle des années bissextiles', () => {
    expect(estDateNue('2024-02-29')).toBe(true) // divisible par 4
    expect(estDateNue('2000-02-29')).toBe(true) // divisible par 400
    expect(estDateNue('1900-02-29')).toBe(false) // divisible par 100, pas par 400
  })
})

describe('dateObligatoire', () => {
  const schema = dateObligatoire('La date est obligatoire')

  it('distingue le VIDE (message métier) du MAL FORMÉ (message de format)', () => {
    // Les deux refus ne disent pas la même chose à l'utilisateur : « quelle
    // date ? » d'un côté, « celle-là ne va pas » de l'autre.
    const vide = schema.safeParse('')
    expect(vide.success).toBe(false)
    expect(vide.error?.issues[0]?.message).toBe('La date est obligatoire')

    const malForme = schema.safeParse('demain')
    expect(malForme.success).toBe(false)
    expect(malForme.error?.issues[0]?.message).toBe(MESSAGE_DATE_INVALIDE)
  })

  it('le message de format est en FRANÇAIS et ne parle pas d’ISO', () => {
    // Celui de Zod est en anglais et cite « ISO 8601 » : illisible dans une
    // application où le calendrier affiche jj/mm/aaaa.
    expect(MESSAGE_DATE_INVALIDE).not.toMatch(/ISO|[Ii]nvalid date/)
    expect(MESSAGE_DATE_INVALIDE).toContain('jj/mm/aaaa')
  })

  it('refuse toute chaîne hostile, accepte toute date du calendrier', () => {
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        if (estDateNue(texte)) return
        expect(rejette(schema, texte)).toBe(true)
      }),
      RUNS,
    )
    fc.assert(
      fc.property(arbDateIso(), (iso) => {
        expect(schema.safeParse(iso).success).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse ce qui n’est pas une chaîne (safeParse reste total)', () => {
    for (const v of [null, undefined, 0, {}, [], new Date()]) {
      expect(rejette(schema, v)).toBe(true)
    }
  })
})

describe('dateFacultative', () => {
  const schema = dateFacultative()

  it('accepte la chaîne vide — « non renseignée »', () => {
    expect(schema.safeParse('').success).toBe(true)
  })

  it('refuse un texte qui n’est pas une date nue', () => {
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        if (texte === '' || estDateNue(texte)) return
        expect(rejette(schema, texte)).toBe(true)
      }),
      RUNS,
    )
  })
})
