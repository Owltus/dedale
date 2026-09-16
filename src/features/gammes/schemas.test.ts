import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  RUNS,
  RUNS_COURT,
  arbChaineHostile,
  arbTexteNumeriquePiege,
  rejette,
  testeBorneTexte,
  testeIdempotence,
  testeRejetBlanc,
  testeTotalite,
} from '@/lib/hostile-inputs.test'
import {
  gammeBiblioSchema,
  gammeNatures,
  gammeSchema,
  operationSchema,
} from './schemas'

/**
 * Oracles (source : `schema_complete.sql`, table `operations`) :
 *   seuil_minimum / seuil_maximum  NUMERIC
 *   ordre                          INTEGER NOT NULL DEFAULT 0  (max 2 147 483 647)
 *   operations_seuils_coherents    seuil_minimum <= seuil_maximum
 *   operations_nom_non_vide        length(trim(nom)) > 0
 *
 * Postgres ≥ 14 ACCEPTE 'Infinity' dans une colonne NUMERIC : un seuil infini
 * s'enregistre donc sans erreur et ne se déclenchera jamais — un contrôle
 * réglementaire silencieusement neutralisé.
 */

const GAMME = {
  nom: 'Vérification annuelle des extincteurs',
  nature: 'controle_reglementaire' as const,
  periodicite_id: '3',
  prestataire_id: 'e3f1c2a0-0000-4000-8000-000000000001',
  categorie_id: 'a1b2c3d4-0000-4000-8000-000000000002',
  description: '',
  miniature_id: null,
  est_active: true,
}

const OPERATION = {
  nom: 'Contrôle de la pression',
  ordre: '1',
  type_operation_id: '2',
  unite_id: '',
  seuil_minimum: '',
  seuil_maximum: '',
  description: '',
}

// ─── gammeSchema ─────────────────────────────────────────────────────────────

describe('gammeSchema', () => {
  testeTotalite('gammeSchema', gammeSchema)
  testeRejetBlanc('gammeSchema', gammeSchema, GAMME, ['nom'])
  testeBorneTexte('gammeSchema', gammeSchema, GAMME, 'nom', 200)
  testeBorneTexte('gammeSchema', gammeSchema, GAMME, 'description', 2000)
  testeIdempotence('gammeSchema', gammeSchema, GAMME)

  it('exige périodicité, prestataire et sous-catégorie (colonnes NOT NULL)', () => {
    for (const champ of ['periodicite_id', 'prestataire_id', 'categorie_id']) {
      expect(rejette(gammeSchema, { ...GAMME, [champ]: '' })).toBe(true)
    }
  })

  it('n’accepte que les deux natures du référentiel', () => {
    // Oracle : `gammeNatures` = contrôle réglementaire | maintenance préventive.
    for (const nature of gammeNatures) {
      expect(gammeSchema.safeParse({ ...GAMME, nature }).success).toBe(true)
    }
    fc.assert(
      fc.property(
        arbChaineHostile().filter(
          (s) => !(gammeNatures as readonly string[]).includes(s),
        ),
        (nature) => {
          expect(rejette(gammeSchema, { ...GAMME, nature })).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('exige un booléen pour est_active (pas une chaîne « true »)', () => {
    // Oracle : colonne BOOLEAN — un 'false' texte serait VRAI côté JS.
    for (const v of ['true', 'false', 0, 1, null, 'oui']) {
      expect(rejette(gammeSchema, { ...GAMME, est_active: v })).toBe(true)
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : les identifiants de référentiel ne sont pas bornés',
    () => {
      // Attendu : `periodicite_id`/`categorie_id`/`prestataire_id` désignent des
      // lignes existantes (SMALLINT ou UUID) → format et longueur contraints.
      // Observé : `z.string().min(1)` accepte 100 000 caractères quelconques,
      // envoyés à PostgREST qui répond 22P02 (invalid_text_representation).
      for (const champ of [
        'periodicite_id',
        'prestataire_id',
        'categorie_id',
      ]) {
        expect(
          rejette(gammeSchema, { ...GAMME, [champ]: 'x'.repeat(100_000) }),
        ).toBe(true)
      }
    },
  )
})

describe('gammeBiblioSchema', () => {
  const BIBLIO = {
    ...GAMME,
    est_active: undefined,
    portee: 'entreprise' as const,
    prestataire_id: '',
  }

  testeTotalite('gammeBiblioSchema', gammeBiblioSchema)

  it('autorise un template commun SANS prestataire (contrairement à la gamme de site)', () => {
    // Oracle : commentaire du schéma — le prestataire dépend du site, renseigné
    // après copie (ADR 0009 : le commun est une RÉSERVE).
    expect(gammeBiblioSchema.safeParse(BIBLIO).success).toBe(true)
    expect(rejette(gammeSchema, { ...GAMME, prestataire_id: '' })).toBe(true)
  })

  it('n’accepte que les deux portées entreprise | site', () => {
    fc.assert(
      fc.property(
        arbChaineHostile().filter((s) => s !== 'entreprise' && s !== 'site'),
        (portee) => {
          expect(rejette(gammeBiblioSchema, { ...BIBLIO, portee })).toBe(true)
        },
      ),
      RUNS,
    )
  })
})

// ─── operationSchema : seuils ────────────────────────────────────────────────

describe('operationSchema — seuils', () => {
  testeTotalite('operationSchema', operationSchema)
  testeRejetBlanc('operationSchema', operationSchema, OPERATION, ['nom'])
  testeBorneTexte('operationSchema', operationSchema, OPERATION, 'nom', 200)
  testeBorneTexte(
    'operationSchema',
    operationSchema,
    OPERATION,
    'description',
    2000,
  )
  testeIdempotence('operationSchema', operationSchema, OPERATION)

  it('fait respecter seuil min ≤ seuil max (CHECK operations_seuils_coherents)', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -1e6,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({
          min: -1e6,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (a, b) => {
          const [min, max] = a <= b ? [a, b] : [b, a]
          expect(
            operationSchema.safeParse({
              ...OPERATION,
              seuil_minimum: String(min),
              seuil_maximum: String(max),
            }).success,
          ).toBe(true)
          if (min !== max) {
            expect(
              rejette(operationSchema, {
                ...OPERATION,
                seuil_minimum: String(max),
                seuil_maximum: String(min),
              }),
            ).toBe(true)
          }
        },
      ),
      RUNS,
    )
  })

  it('ne compare les seuils QUE si les deux sont renseignés', () => {
    // Oracle : le CHECK SQL est neutralisé dès qu'un seuil est NULL.
    fc.assert(
      fc.property(
        fc.double({
          min: -1e6,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (n) => {
          expect(
            operationSchema.safeParse({
              ...OPERATION,
              seuil_minimum: String(n),
              seuil_maximum: '',
            }).success,
          ).toBe(true)
          expect(
            operationSchema.safeParse({
              ...OPERATION,
              seuil_minimum: '',
              seuil_maximum: String(n),
            }).success,
          ).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('RÉFUTATION : un seuil NÉGATIF est légitime et doit rester accepté', () => {
    // La reconnaissance soupçonnait `-5` d'être un trou. C'en est un pour une
    // surface, pas pour un seuil : une chambre froide se contrôle entre −25 °C
    // et −18 °C. Oracle : la colonne est un NUMERIC signé, sans CHECK de signe.
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: -1 }), (n) => {
        expect(
          operationSchema.safeParse({
            ...OPERATION,
            seuil_minimum: String(n),
            seuil_maximum: '0',
          }).success,
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it.fails('BUG CANDIDAT Martin : un seuil « Infinity » est accepté', () => {
    // Attendu : un seuil est une valeur MESURABLE ; l'infini n'en est pas une.
    // Observé : `optionalNumber` ne teste que `Number.isNaN(Number(v))`, or
    // `Number('Infinity') === Infinity` → accepté. Conséquence : Postgres ≥ 14
    // stocke 'Infinity' dans un NUMERIC sans broncher → un seuil qui ne se
    // déclenchera JAMAIS, sur un contrôle réglementaire.
    // Contre-exemples : 'Infinity', '-Infinity'.
    for (const v of ['Infinity', '-Infinity']) {
      expect(rejette(operationSchema, { ...OPERATION, seuil_minimum: v })).toBe(
        true,
      )
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : un seuil en notation hexadécimale est RÉINTERPRÉTÉ',
    () => {
      // Attendu : '0x1F' n'est pas une saisie de seuil → rejet.
      // Observé : `Number('0x1F') === 31` → accepté, et enregistré comme 31.
      // C'est le pire des cas : pas d'erreur, une valeur DIFFÉRENTE de ce qui a
      // été saisi. Contre-exemples : '0x1F' → 31, '0b101' → 5, '0o17' → 15.
      for (const v of ['0x1F', '0x10', '0b101', '0o17']) {
        expect(
          rejette(operationSchema, { ...OPERATION, seuil_minimum: v }),
        ).toBe(true)
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : un seuil en notation exponentielle démesurée passe',
    () => {
      // Attendu : aucune grandeur relevée sur le terrain ne vaut 1e300.
      // Observé : accepté (Number('1e300') n'est pas NaN).
      expect(
        rejette(operationSchema, { ...OPERATION, seuil_minimum: '1e300' }),
      ).toBe(true)
    },
  )

  it('refuse bien tout ce que Number() rend NaN', () => {
    // Oracle : c'est la SEULE garantie qu'offre `optionalNumber` — on la borne
    // pour que ce test devienne rouge si quelqu'un l'affaiblit encore.
    fc.assert(
      fc.property(arbTexteNumeriquePiege(), (texte) => {
        const t = texte.trim()
        const attenduAccepte = t === '' || !Number.isNaN(Number(t))
        expect(
          operationSchema.safeParse({ ...OPERATION, seuil_minimum: texte })
            .success,
        ).toBe(attenduAccepte)
      }),
      RUNS,
    )
  })
})

// ─── operationSchema : ordre ─────────────────────────────────────────────────

describe('operationSchema — ordre', () => {
  it('n’accepte qu’une suite de chiffres ASCII, ou le vide', () => {
    // Oracle : `ordre INTEGER NOT NULL DEFAULT 0` — un rang de checklist.
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        const t = texte.trim()
        const attendu = t === '' || /^\d+$/.test(t)
        expect(
          operationSchema.safeParse({ ...OPERATION, ordre: texte }).success,
        ).toBe(attendu)
      }),
      RUNS,
    )
  })

  it('refuse les chiffres non-ASCII et les signes', () => {
    for (const v of ['٥', '+5', '-1', '1e3', '1.0', ' 1 2 ']) {
      expect(rejette(operationSchema, { ...OPERATION, ordre: v })).toBe(true)
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : l’ordre n’a pas de borne haute (colonne INTEGER)',
    () => {
      // Attendu : `operations.ordre` est un INTEGER → 2 147 483 647 au plus.
      // Observé : `/^\d+$/` accepte 40 chiffres ('9'.repeat(40)) → 22003
      // (numeric field overflow) affiché en message technique brut.
      fc.assert(
        fc.property(fc.integer({ min: 11, max: 60 }), (nbChiffres) => {
          expect(
            rejette(operationSchema, {
              ...OPERATION,
              ordre: '9'.repeat(nbChiffres),
            }),
          ).toBe(true)
        }),
        RUNS_COURT,
      )
    },
  )
})
