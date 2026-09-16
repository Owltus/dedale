import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CHAINES_BLANCHES,
  CHAINES_INVISIBLES,
  RUNS,
  arbChaineHostile,
  rejette,
  testeTotalite,
} from '@/lib/hostile-inputs.test'
import {
  CHAMP_TYPES,
  champSchema,
  prepareChamps,
  serializeChamps,
} from './champs'

/**
 * `champSchema` valide UNE caractéristique libre (doctrine backend §9 : le
 * gabarit vit sur le CONTENEUR, les valeurs sur l'objet, qui en garde un
 * snapshot). Il est la porte d'entrée du JSONB `specifications` — et, surtout,
 * le FILTRE DE LECTURE : `parseChamps` jette en silence tout champ qu'il refuse.
 *
 * Oracles :
 *   - `cle` ≤ 60, `unite` ≤ 20 : bornes alignées à la main dans `prepareChamps`
 *     (« sans ce garde-fou, un champ trop long s'écrirait mais serait JETÉ en
 *     silence par parseChamps »).
 *   - CHECK backend `chk_modeles_equipements_specs_structure` :
 *     `specifications::text` < 10 000 caractères.
 *   - Le JSONB ne sait pas représenter Infinity/NaN : `JSON.stringify` les
 *     convertit en `null`. Une valeur numérique non finie est donc une perte
 *     de donnée silencieuse.
 */

const CHAMP_TEXTE = {
  cle: 'Marque',
  type: 'texte' as const,
  requis: false,
  defaut: null,
}

describe('champSchema — structure', () => {
  testeTotalite('champSchema', champSchema)

  it('accepte les 5 types du référentiel, et eux seuls', () => {
    for (const { value } of CHAMP_TYPES) {
      expect(
        champSchema.safeParse({ ...CHAMP_TEXTE, type: value }).success,
      ).toBe(true)
    }
    const legaux = new Set(CHAMP_TYPES.map((t) => t.value as string))
    fc.assert(
      fc.property(
        arbChaineHostile().filter((s) => !legaux.has(s)),
        (type) => {
          expect(rejette(champSchema, { ...CHAMP_TEXTE, type })).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('exige `requis` et `defaut` (un champ sans défaut n’est pas un gabarit)', () => {
    expect(
      rejette(champSchema, { cle: 'a', type: 'texte', defaut: null }),
    ).toBe(true)
    expect(
      rejette(champSchema, { cle: 'a', type: 'texte', requis: false }),
    ).toBe(true)
  })

  it('borne la clé à 60 caractères et l’unité à 20', () => {
    // Oracle : bornes que `prepareChamps` réplique explicitement pour éviter la
    // perte silencieuse à la relecture.
    expect(
      champSchema.safeParse({ ...CHAMP_TEXTE, cle: 'a'.repeat(60) }).success,
    ).toBe(true)
    expect(
      champSchema.safeParse({
        ...CHAMP_TEXTE,
        type: 'nombre',
        unite: 'a'.repeat(20),
      }).success,
    ).toBe(true)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (surplus) => {
        expect(
          rejette(champSchema, {
            ...CHAMP_TEXTE,
            cle: 'a'.repeat(60 + surplus),
          }),
        ).toBe(true)
        expect(
          rejette(champSchema, {
            ...CHAMP_TEXTE,
            unite: 'a'.repeat(20 + surplus),
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse une valeur numérique NON FINIE (perte silencieuse en JSONB)', () => {
    // Oracle : JSON.stringify({v: Infinity}) === '{"v":null}' — accepter
    // l'infini reviendrait à enregistrer `null` sans le dire.
    for (const champ of ['defaut', 'valeur']) {
      for (const v of [Infinity, -Infinity, NaN]) {
        expect(
          rejette(champSchema, { ...CHAMP_TEXTE, type: 'nombre', [champ]: v }),
        ).toBe(true)
      }
    }
    expect(JSON.stringify({ v: Infinity })).toBe('{"v":null}')
  })

  it('refuse une option de liste VIDE', () => {
    // Oracle : `options: z.array(z.string().trim().min(1))` — une option vide
    // serait un choix invisible dans le sélecteur.
    fc.assert(
      fc.property(fc.constantFrom(...CHAINES_BLANCHES, ''), (blanc) => {
        expect(
          rejette(champSchema, {
            ...CHAMP_TEXTE,
            type: 'liste',
            options: ['Acier', blanc],
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : la clé d’un champ peut être vide ou blanche',
    () => {
      // Attendu : `cle` EST l'identité de la caractéristique (unicité vérifiée
      // dessus, insensible à la casse, dans `prepareChamps`) — elle ne peut pas
      // être vide. Observé : `z.string().trim().max(60)` n'a PAS de `.min(1)`.
      // `prepareChamps` rattrape à l'ÉCRITURE, mais `parseChamps` — qui relit le
      // JSONB déjà en base, y compris les specs importées ou posées par une RPC
      // (`copier_modele_equipement`, `instancier_equipement`) — accepte la clé
      // vide et l'affiche comme une ligne anonyme dans la fiche.
      // Contre-exemples : '', '   ', et les invisibles U+200B / U+202E.
      for (const cle of ['', ...CHAINES_BLANCHES, ...CHAINES_INVISIBLES]) {
        expect(rejette(champSchema, { ...CHAMP_TEXTE, cle })).toBe(true)
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : un champ « liste » sans options est accepté',
    () => {
      // Attendu : une liste sans choix n'est pas saisissable — c'est d'ailleurs
      // ce que `prepareChamps` refuse (« doit avoir au moins une option »).
      // Observé : `options` est `.optional()` sans condition sur le type → le
      // schéma laisse passer, et `parseChamps` réhydrate un sélecteur vide.
      expect(
        rejette(champSchema, { ...CHAMP_TEXTE, type: 'liste', options: [] }),
      ).toBe(true)
      expect(rejette(champSchema, { ...CHAMP_TEXTE, type: 'liste' })).toBe(true)
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : ni le nombre ni la taille des options ne sont bornés',
    () => {
      // Attendu : le CHECK backend `chk_modeles_equipements_specs_structure`
      // plafonne `specifications::text` à 10 000 caractères — le schéma doit
      // s'en approcher plutôt que laisser passer puis échouer en 23514.
      // Observé : 10 000 options, ou une option de 100 000 caractères, passent.
      expect(
        rejette(champSchema, {
          ...CHAMP_TEXTE,
          type: 'liste',
          options: Array.from({ length: 10_000 }, (_, i) => `opt${String(i)}`),
        }),
      ).toBe(true)
      expect(
        rejette(champSchema, {
          ...CHAMP_TEXTE,
          type: 'liste',
          options: ['x'.repeat(100_000)],
        }),
      ).toBe(true)
    },
  )
})

describe('champSchema — accord avec prepareChamps', () => {
  it('tout champ accepté par prepareChamps repasse champSchema', () => {
    // Propriété d'ALIGNEMENT : `prepareChamps` nettoie AVANT sérialisation ; ce
    // qu'il rend doit être relisible par `parseChamps` (qui filtre au
    // `champSchema`), sinon la caractéristique est écrite puis perdue.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            cle: fc.string({ minLength: 1, maxLength: 30 }),
            type: fc.constantFrom(...CHAMP_TYPES.map((t) => t.value)),
            requis: fc.boolean(),
            defaut: fc.oneof(
              fc.constant(null),
              fc.string({ maxLength: 20 }),
              fc.integer({ min: -1000, max: 1000 }),
              fc.boolean(),
            ),
            unite: fc.string({ maxLength: 10 }),
            options: fc.array(fc.string({ maxLength: 10 }), { maxLength: 4 }),
          }),
          { maxLength: 6 },
        ),
        (champs) => {
          const r = prepareChamps(champs)
          if (!r.ok) return
          for (const c of r.champs) {
            expect(champSchema.safeParse(c).success).toBe(true)
          }
          // Et la sérialisation reste sous la borne annoncée.
          expect(
            JSON.stringify(serializeChamps(r.champs)).length,
          ).toBeLessThanOrEqual(9500)
        },
      ),
      RUNS,
    )
  })
})
