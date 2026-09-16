import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CHAINES_INVISIBLES,
  RUNS,
  arbChaineHostile,
  rejette,
  testeBorneTexte,
  testeIdempotence,
  testeRejetBlanc,
  testeTotalite,
} from '@/lib/hostile-inputs.test'
import { CATEGORIE_SCOPES, categorieSchema } from './schemas'

/**
 * Oracles :
 *   - Doctrine backend §10 (ADR 0009) : `portee` ∈ { entreprise, site } — il n'y
 *     a que deux portées, le commun (`site_id NULL`) et le site.
 *   - Commentaire du schéma : le scope 'parc' N'EST PAS proposé dans l'UI (la
 *     page Équipements le force) mais « reste accepté par le schéma ».
 *   - `etat` ∈ { actif, inactif } — activation sans suppression (hard-delete,
 *     doctrine §4 : la colonne `deleted_at` n'existe plus).
 */

const CATEGORIE = {
  nom: 'Sécurité incendie',
  scope: 'gamme' as const,
  description: '',
  parent_id: '',
  portee: 'entreprise' as const,
  etat: 'actif' as const,
  miniature_id: null,
}

describe('categorieSchema', () => {
  testeTotalite('categorieSchema', categorieSchema)
  testeRejetBlanc('categorieSchema', categorieSchema, CATEGORIE, ['nom'])
  testeBorneTexte('categorieSchema', categorieSchema, CATEGORIE, 'nom', 200)
  testeBorneTexte(
    'categorieSchema',
    categorieSchema,
    CATEGORIE,
    'description',
    2000,
  )
  testeIdempotence('categorieSchema', categorieSchema, CATEGORIE)

  it('accepte les 4 scopes proposés dans l’UI, PLUS « parc »', () => {
    // Oracle : commentaire du schéma — 'parc' n'est jamais choisi à la main mais
    // reste une valeur légale (la page Équipements la force en preset).
    for (const { value } of CATEGORIE_SCOPES) {
      expect(
        categorieSchema.safeParse({ ...CATEGORIE, scope: value }).success,
      ).toBe(true)
    }
    expect(
      categorieSchema.safeParse({ ...CATEGORIE, scope: 'parc' }).success,
    ).toBe(true)
  })

  it('refuse tout scope hors du référentiel', () => {
    const legaux = new Set([
      ...CATEGORIE_SCOPES.map((s) => s.value as string),
      'parc',
    ])
    fc.assert(
      fc.property(
        arbChaineHostile().filter((s) => !legaux.has(s)),
        (scope) => {
          expect(rejette(categorieSchema, { ...CATEGORIE, scope })).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('refuse toute portée hors { entreprise, site } (ADR 0009)', () => {
    fc.assert(
      fc.property(
        arbChaineHostile().filter((s) => s !== 'entreprise' && s !== 'site'),
        (portee) => {
          expect(rejette(categorieSchema, { ...CATEGORIE, portee })).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('refuse tout état hors { actif, inactif }', () => {
    fc.assert(
      fc.property(
        arbChaineHostile().filter((s) => s !== 'actif' && s !== 'inactif'),
        (etat) => {
          expect(rejette(categorieSchema, { ...CATEGORIE, etat })).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('accepte un parent vide (catégorie racine)', () => {
    // Oracle : « '' = catégorie racine (sans parent) ».
    expect(
      categorieSchema.safeParse({ ...CATEGORIE, parent_id: '' }).success,
    ).toBe(true)
  })

  it('refuse un nom fait de seuls caractères invisibles', () => {
    // ORACLE : une catégorie structure l'arborescence de la Bibliothèque — son
    // nom doit être lisible et sert de segment d'URL (slugifié).
    // Régression couverte : U+200B / U+202E passaient le `.trim()` — un nœud
    // sans nom visible dans l'explorateur, et un slug vide dans l'URL de
    // descente. `texteObligatoire` (lib/texte-zod) exige désormais au moins un
    // caractère visible.
    for (const invisible of CHAINES_INVISIBLES) {
      expect(rejette(categorieSchema, { ...CATEGORIE, nom: invisible })).toBe(
        true,
      )
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : parent_id et miniature_id ne sont ni bornés ni typés',
    () => {
      // Attendu : UUID (ou '' pour parent_id). Observé : `z.string()` nu accepte
      // 100 000 caractères → 22P02 côté PostgREST.
      for (const champ of ['parent_id', 'miniature_id']) {
        expect(
          rejette(categorieSchema, {
            ...CATEGORIE,
            [champ]: 'x'.repeat(100_000),
          }),
        ).toBe(true)
      }
    },
  )
})
