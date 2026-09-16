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
import { operationSchema } from '@/features/gammes/schemas'
import { modeleOperationSchema, operationItemSchema } from './schemas'

/**
 * Oracles (source : `schema_complete.sql`, table `modeles_operations_items`) :
 *   seuil_minimum / seuil_maximum  NUMERIC
 *   ordre                          INTEGER NOT NULL DEFAULT 0
 *   CHECK  seuil_minimum <= seuil_maximum
 *
 * `operationItemSchema` (modèle réutilisable) et `operationSchema` (opération
 * de gamme) valident LA MÊME saisie : ils doivent se comporter à l'identique,
 * sinon la règle dépend de l'écran par lequel on passe (catalogue commun vs site).
 */

const MODELE = {
  nom: 'Contrôle trimestriel',
  description: '',
  // `modeles_operations.categorie_id` est un UUID : le fixture en porte un vrai,
  // sinon les propriétés génériques ci-dessous valideraient dans le vide.
  categorie_id: 'a1b2c3d4-0000-4000-8000-000000000002',
  miniature_id: null,
  portee: 'entreprise' as const,
}

const ITEM = {
  nom: 'Mesure de débit',
  ordre: '1',
  type_operation_id: '2',
  unite_id: '',
  seuil_minimum: '',
  seuil_maximum: '',
  description: '',
}

describe('modeleOperationSchema', () => {
  testeTotalite('modeleOperationSchema', modeleOperationSchema)
  testeRejetBlanc('modeleOperationSchema', modeleOperationSchema, MODELE, [
    'nom',
  ])
  testeBorneTexte(
    'modeleOperationSchema',
    modeleOperationSchema,
    MODELE,
    'nom',
    200,
  )
  testeBorneTexte(
    'modeleOperationSchema',
    modeleOperationSchema,
    MODELE,
    'description',
    2000,
  )
  testeIdempotence('modeleOperationSchema', modeleOperationSchema, MODELE)

  it('exige une catégorie de rattachement', () => {
    // Oracle : « Catégorie de rattachement, OBLIGATOIRE ».
    expect(
      rejette(modeleOperationSchema, { ...MODELE, categorie_id: '' }),
    ).toBe(true)
  })

  it('n’accepte que les portées entreprise | site (ADR 0009)', () => {
    // Oracle : `site_id NULL` = catalogue du siège ; `site_id` renseigné = site.
    // Toute autre valeur dénoterait une troisième portée, qui n'existe pas.
    fc.assert(
      fc.property(
        arbChaineHostile().filter((s) => s !== 'entreprise' && s !== 'site'),
        (portee) => {
          expect(rejette(modeleOperationSchema, { ...MODELE, portee })).toBe(
            true,
          )
        },
      ),
      RUNS,
    )
  })
})

describe('operationItemSchema — seuils', () => {
  testeTotalite('operationItemSchema', operationItemSchema)
  testeRejetBlanc('operationItemSchema', operationItemSchema, ITEM, ['nom'])
  testeBorneTexte('operationItemSchema', operationItemSchema, ITEM, 'nom', 200)
  testeIdempotence('operationItemSchema', operationItemSchema, ITEM)

  it('fait respecter seuil min ≤ seuil max', () => {
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
            operationItemSchema.safeParse({
              ...ITEM,
              seuil_minimum: String(min),
              seuil_maximum: String(max),
            }).success,
          ).toBe(true)
          if (min !== max) {
            expect(
              rejette(operationItemSchema, {
                ...ITEM,
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

  it('se comporte EXACTEMENT comme operationSchema (même saisie, même verdict)', () => {
    // Propriété d'ALIGNEMENT : les deux écrans saisissent la même opération.
    // Ce test devient rouge dès que l'un des deux schémas est durci seul —
    // ce qui est exactement le moment où il faut durcir l'autre.
    fc.assert(
      fc.property(
        arbTexteNumeriquePiege(),
        arbTexteNumeriquePiege(),
        arbChaineHostile(),
        (min, max, ordre) => {
          const commun = { seuil_minimum: min, seuil_maximum: max, ordre }
          expect(
            operationItemSchema.safeParse({ ...ITEM, ...commun }).success,
          ).toBe(operationSchema.safeParse({ ...ITEM, ...commun }).success)
        },
      ),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : mêmes trous que operationSchema (Infinity, hexa, exponentielle)',
    () => {
      // `optionalNumber` est DUPLIQUÉ ici à l'identique — le trou l'est aussi.
      // Reste rouge pour le SEUL '1e300' : 'Infinity', '0x1F' et '0b101' sont
      // désormais refusés des deux côtés (cf. `operationSchema — seuils`).
      // '1e300' n'est pas une divergence avec la base — un NUMERIC Postgres
      // l'accepte — mais un seuil hors d'échelle : le refuser demande une borne
      // de plausibilité que personne n'a encore arbitrée.
      for (const v of ['Infinity', '-Infinity', '0x1F', '0b101', '1e300']) {
        expect(
          rejette(operationItemSchema, { ...ITEM, seuil_minimum: v }),
        ).toBe(true)
      }
    },
  )

  it('borne le rang à la capacité d’un INTEGER', () => {
    // ORACLE : `modeles_operations_items.ordre INTEGER` → 2 147 483 647 au plus.
    // Régression couverte : `/^\d+$/` seul accepte une suite de chiffres
    // arbitrairement longue, que la base rejette ensuite en 22003 (numeric
    // field overflow) — affiché en message technique brut.
    fc.assert(
      fc.property(fc.integer({ min: 11, max: 60 }), (nbChiffres) => {
        expect(
          rejette(operationItemSchema, {
            ...ITEM,
            ordre: '9'.repeat(nbChiffres),
          }),
        ).toBe(true)
      }),
      RUNS_COURT,
    )
    expect(
      operationItemSchema.safeParse({ ...ITEM, ordre: '2147483647' }).success,
    ).toBe(true)
  })
})
