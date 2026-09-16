import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CHAINES_NUMERIQUES_PIEGES,
  RUNS,
  arbChaineHostile,
  rejette,
  testeBorneTexte,
  testeIdempotence,
  testeRejetBlanc,
  testeTotalite,
} from '@/lib/hostile-inputs.test'
import {
  clotureCapexSchema,
  investissementSchema,
  parseMontant,
} from './schemas'

/**
 * Oracles (source : `schema_complete.sql`, table `investissements`) :
 *   montant_demande NUMERIC(12,2) CHECK (… >= 0)
 *   → 12 chiffres significatifs dont 2 décimales ⇒ maximum EXACT 9 999 999 999,99.
 *   Au-delà, Postgres lève 22003 (numeric field overflow) ; plus de 2 décimales
 *   sont arrondies EN SILENCE par la base — d'où le contrôle front.
 */

const BASE = {
  libelle: 'Remplacement CTA bâtiment A',
  description: '',
  montant_demande: '',
  montant_prevu: '',
  depense_reelle: '',
  date_demande: '2026-01-15',
}

const CHAMPS_MONTANT = [
  'montant_demande',
  'montant_prevu',
  'depense_reelle',
] as const

/** Borne exacte de NUMERIC(12,2). */
const MAX_NUMERIC_12_2 = 9_999_999_999.99

describe('investissementSchema — structure', () => {
  testeTotalite('investissementSchema', investissementSchema)
  testeRejetBlanc('investissementSchema', investissementSchema, BASE, [
    'libelle',
  ])
  testeBorneTexte(
    'investissementSchema',
    investissementSchema,
    BASE,
    'libelle',
    200,
  )
  testeBorneTexte(
    'investissementSchema',
    investissementSchema,
    BASE,
    'description',
    2000,
  )
  testeIdempotence('investissementSchema', investissementSchema, BASE)

  it('exige une date de demande', () => {
    expect(rejette(investissementSchema, { ...BASE, date_demande: '' })).toBe(
      true,
    )
  })
})

describe('investissementSchema — montants', () => {
  it('accepte un décimal à 0, 1 ou 2 décimales, point OU virgule', () => {
    // Oracle : saisie « à la française » admise, 2 décimales max (NUMERIC(12,2)).
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9_999_999 }),
        fc.integer({ min: 0, max: 99 }),
        fc.constantFrom('.', ','),
        (entier, cents, sep) => {
          const texte = `${String(entier)}${sep}${String(cents).padStart(2, '0')}`
          for (const champ of CHAMPS_MONTANT) {
            expect(
              investissementSchema.safeParse({ ...BASE, [champ]: texte })
                .success,
            ).toBe(true)
          }
        },
      ),
      RUNS,
    )
  })

  it('refuse plus de 2 décimales', () => {
    // Oracle : NUMERIC(12,2) arrondirait en silence — on refuse AVANT le réseau.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 3, max: 12 }),
        fc.constantFrom('.', ','),
        (entier, nbDecimales, sep) => {
          const texte = `${String(entier)}${sep}${'1'.repeat(nbDecimales)}`
          for (const champ of CHAMPS_MONTANT) {
            expect(
              rejette(investissementSchema, { ...BASE, [champ]: texte }),
            ).toBe(true)
          }
        },
      ),
      RUNS,
    )
  })

  it('refuse tout montant NÉGATIF (CHECK montant_demande >= 0)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -9_999_999, max: -1 }), (n) => {
        for (const champ of CHAMPS_MONTANT) {
          expect(
            rejette(investissementSchema, { ...BASE, [champ]: String(n) }),
          ).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('pince la borne EXACTE de NUMERIC(12,2)', () => {
    // Oracle : 9 999 999 999,99 est la plus grande valeur représentable ;
    // 10 000 000 000 est la plus petite qui déborde (22003).
    expect(
      investissementSchema.safeParse({
        ...BASE,
        montant_demande: '9999999999.99',
      }).success,
    ).toBe(true)
    expect(
      investissementSchema.safeParse({
        ...BASE,
        montant_demande: '9999999999,99',
      }).success,
    ).toBe(true)
    expect(
      rejette(investissementSchema, {
        ...BASE,
        montant_demande: '10000000000',
      }),
    ).toBe(true)
    expect(
      rejette(investissementSchema, {
        ...BASE,
        montant_demande: '10000000000.00',
      }),
    ).toBe(true)
  })

  it('refuse tout ce qui dépasse la borne, pour n’importe quel surplus', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), (surplus) => {
        const valeur = String(10_000_000_000 + surplus)
        for (const champ of CHAMPS_MONTANT) {
          expect(
            rejette(investissementSchema, { ...BASE, [champ]: valeur }),
          ).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('refuse les écritures numériques pièges (exponentielle, hexa, infinis, signes)', () => {
    // Oracle : la regex `^\d+([.,]\d{1,2})?$` est la définition du format
    // admis — aucune de ces écritures n'en fait partie, et `Number()` les
    // interpréterait de façon surprenante côté base.
    const ACCEPTEES = new Set([' 5 ']) // détourée par `.trim()` → « 5 », licite
    for (const piege of CHAINES_NUMERIQUES_PIEGES) {
      const attenduRejet = !ACCEPTEES.has(piege)
      expect({
        piege,
        rejete: rejette(investissementSchema, {
          ...BASE,
          montant_demande: piege,
        }),
      }).toEqual({ piege, rejete: attenduRejet })
    }
  })

  it('refuse toute chaîne hostile qui n’est pas au format décimal admis', () => {
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        const t = texte.trim()
        const bienForme =
          t === '' ||
          (/^\d+([.,]\d{1,2})?$/.test(t) &&
            Number(t.replace(',', '.')) <= MAX_NUMERIC_12_2)
        expect(
          investissementSchema.safeParse({ ...BASE, montant_demande: texte })
            .success,
        ).toBe(bienForme)
      }),
      RUNS,
    )
  })

  it('accepte le vide (montant non renseigné → NULL en base)', () => {
    expect(investissementSchema.safeParse(BASE).success).toBe(true)
    expect(parseMontant('')).toBeNull()
    expect(parseMontant('   ')).toBeNull()
  })

  it('parseMontant rend exactement la valeur que la regex a validée', () => {
    // Oracle : l'INSERT utilise `parseMontant` — il ne doit pas réinterpréter
    // ce que le schéma a accepté (virgule française → point, rien d'autre).
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9_999_999 }),
        fc.integer({ min: 0, max: 99 }),
        (entier, cents) => {
          const cc = String(cents).padStart(2, '0')
          expect(parseMontant(`${String(entier)},${cc}`)).toBe(
            Number(`${String(entier)}.${cc}`),
          )
          expect(parseMontant(` ${String(entier)}.${cc} `)).toBe(
            Number(`${String(entier)}.${cc}`),
          )
        },
      ),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : date_demande accepte n’importe quel texte',
    () => {
      // Attendu : `investissements.date_demande` est une colonne DATE.
      // Observé : `z.string().min(1)` laisse passer tout texte non vide
      // ('<script>alert(1)</script>', '2026-13-45'…) → 22007 en brut.
      fc.assert(
        fc.property(arbChaineHostile(), (texte) => {
          if (texte.trim() === '') return
          if (/^\d{4}-\d{2}-\d{2}$/.test(texte.trim())) return
          expect(
            rejette(investissementSchema, { ...BASE, date_demande: texte }),
          ).toBe(true)
        }),
        RUNS,
      )
    },
  )
})

describe('clotureCapexSchema', () => {
  testeTotalite('clotureCapexSchema', clotureCapexSchema)

  it('exige la date de clôture, pas le bilan', () => {
    // Oracle : commentaire du schéma — « le bilan n'est PAS obligatoire ».
    expect(
      rejette(clotureCapexSchema, {
        date_cloture: '',
        bilan: 'rien à signaler',
      }),
    ).toBe(true)
    expect(
      clotureCapexSchema.safeParse({ date_cloture: '2026-06-30', bilan: '' })
        .success,
    ).toBe(true)
  })

  it('borne le bilan à 5000 caractères', () => {
    expect(
      clotureCapexSchema.safeParse({
        date_cloture: '2026-06-30',
        bilan: 'a'.repeat(5000),
      }).success,
    ).toBe(true)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (surplus) => {
        expect(
          rejette(clotureCapexSchema, {
            date_cloture: '2026-06-30',
            bilan: 'a'.repeat(5000 + surplus),
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })
})
