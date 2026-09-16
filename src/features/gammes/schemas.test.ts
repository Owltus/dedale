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

  it('borne le FORMAT des identifiants de référentiel', () => {
    // ORACLE : `periodicite_id` est un SMALLINT, `prestataire_id` et
    // `categorie_id` des UUID (`schema_complete.sql`).
    // Régression couverte : `z.string().min(1)` accepte 100 000 caractères
    // quelconques, envoyés tels quels à PostgREST qui répond 22P02
    // (invalid_text_representation) — un message technique brut à l'écran.
    for (const champ of ['periodicite_id', 'prestataire_id', 'categorie_id']) {
      expect(
        rejette(gammeSchema, { ...GAMME, [champ]: 'x'.repeat(100_000) }),
      ).toBe(true)
    }
    // Le champ reste une `string` (ce que produit un `<select>`) : c'est bien
    // la FORME qui est vérifiée, pas le type JS.
    expect(gammeSchema.safeParse(GAMME).success).toBe(true)
    expect(rejette(gammeSchema, { ...GAMME, periodicite_id: '-1' })).toBe(true)
    expect(
      rejette(gammeSchema, { ...GAMME, categorie_id: 'pas-un-uuid' }),
    ).toBe(true)
  })
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

  it('refuse un seuil infini', () => {
    // ORACLE : un seuil est une valeur MESURABLE ; l'infini n'en est pas une.
    // Régression couverte : `Number.isNaN(Number(v))` seul laisse passer
    // 'Infinity', que Postgres ≥ 14 stocke dans un NUMERIC sans broncher — un
    // seuil qui ne se déclenchera JAMAIS, sur un contrôle réglementaire.
    for (const v of ['Infinity', '-Infinity']) {
      expect(rejette(operationSchema, { ...OPERATION, seuil_minimum: v })).toBe(
        true,
      )
    }
  })

  it('refuse un seuil en notation hexadécimale, binaire ou octale', () => {
    // ORACLE : la saisie doit valoir ce qu'elle dit.
    // Régression couverte : `Number('0x1F')` vaut 31 — le seuil s'enregistrerait
    // à 31 sans erreur. C'est le pire des cas : pas de refus, une valeur
    // DIFFÉRENTE de celle qui a été saisie. De même '0b101' → 5, '0o17' → 15.
    for (const v of ['0x1F', '0x10', '0b101', '0o17']) {
      expect(rejette(operationSchema, { ...OPERATION, seuil_minimum: v })).toBe(
        true,
      )
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : un seuil en notation exponentielle démesurée passe',
    () => {
      // Attendu : aucune grandeur relevée sur le terrain ne vaut 1e300.
      // Observé : accepté — la notation exponentielle doit rester admise
      // (`String(5e-324)` la produit seul), et 1e300 est un NUMERIC parfaitement
      // légal côté base. Ce n'est donc PAS une divergence front/base mais une
      // borne de PLAUSIBILITÉ, qui reste à arbitrer : la poser trop bas
      // refuserait un index de compteur légitime.
      expect(
        rejette(operationSchema, { ...OPERATION, seuil_minimum: '1e300' }),
      ).toBe(true)
    },
  )

  it('n’accepte QUE la notation numérique usuelle, finie', () => {
    // Oracle : la garantie qu'offre `optionalNumber` — on l'énonce ici en toutes
    // lettres pour que ce test devienne rouge si quelqu'un l'affaiblit.
    // `Number()` seul ne suffisait pas : il lit '0x1F' comme 31, '0o17' comme 15
    // et 'Infinity' comme l'infini. L'exponentielle reste admise — `String()` la
    // produit seul pour les très petites valeurs (`String(5e-324)`).
    const NOMBRE_USUEL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
    fc.assert(
      fc.property(arbTexteNumeriquePiege(), (texte) => {
        const t = texte.trim()
        const attenduAccepte =
          t === '' || (NOMBRE_USUEL.test(t) && Number.isFinite(Number(t)))
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
  it('n’accepte qu’une suite de chiffres ASCII tenant dans un INTEGER, ou le vide', () => {
    // Oracle : `ordre INTEGER NOT NULL DEFAULT 0` — un rang de checklist, donc
    // des chiffres ASCII ET la capacité de la colonne (2 147 483 647).
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        const t = texte.trim()
        const attendu =
          t === '' || (/^\d+$/.test(t) && Number(t) <= 2_147_483_647)
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

  it('borne le rang à la capacité d’un INTEGER', () => {
    // ORACLE : `operations.ordre` est un INTEGER → 2 147 483 647 au plus.
    // Régression couverte : `/^\d+$/` seul accepte 40 chiffres ('9'.repeat(40)),
    // que la base rejette ensuite en 22003 (numeric field overflow), affiché en
    // message technique brut.
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
    expect(
      operationSchema.safeParse({ ...OPERATION, ordre: '2147483647' }).success,
    ).toBe(true)
  })
})
