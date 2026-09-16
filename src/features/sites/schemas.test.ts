import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CHAINES_INVISIBLES,
  CHARGES_INJECTION,
  RUNS,
  rejette,
  testeBorneTexte,
  testeIdempotence,
  testeRejetBlanc,
  testeTotalite,
} from '@/lib/hostile-inputs.test'
import { siteSchema } from './schemas'

/**
 * Oracles (source : `schema_complete.sql`, table `sites`) :
 *   nom  TEXT NOT NULL CHECK (length(trim(nom)) > 0)
 *   uq_sites_nom_active  UNIQUE (lower(nom))  → un nom vide ou invisible rend
 *                        la ligne inatteignable ET bloque la création suivante
 *                        (23505 sur un nom « vide »).
 *   adresse / code_postal / ville : TEXT libres.
 * La gestion des sites est ADMIN SEULE (doctrine : « sites admin-only »).
 */

const SITE = {
  nom: 'Centre culturel Jean-Moulin',
  adresse: '12 rue des Lilas',
  code_postal: '44000',
  ville: 'Nantes',
}

describe('siteSchema', () => {
  testeTotalite('siteSchema', siteSchema)
  testeRejetBlanc('siteSchema', siteSchema, SITE, ['nom'])
  testeBorneTexte('siteSchema', siteSchema, SITE, 'nom', 200)
  testeBorneTexte('siteSchema', siteSchema, SITE, 'adresse', 500)
  testeBorneTexte('siteSchema', siteSchema, SITE, 'code_postal', 20)
  testeBorneTexte('siteSchema', siteSchema, SITE, 'ville', 200)
  testeIdempotence('siteSchema', siteSchema, SITE)

  it('accepte une adresse, un code postal et une ville VIDES', () => {
    // Oracle : ces trois colonnes sont NULLABLE en base — un site peut être
    // créé avant que son adresse soit connue.
    expect(
      siteSchema.safeParse({
        nom: 'Site X',
        adresse: '',
        code_postal: '',
        ville: '',
      }).success,
    ).toBe(true)
  })

  it('détoure tous les champs texte', () => {
    // Oracle : `.trim()` est appliqué à chacun — l'unicité SQL porte sur
    // `lower(nom)`, un espace de fin créerait un faux doublon distinct.
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim() !== ''),
        (brut) => {
          const r = siteSchema.safeParse({ ...SITE, nom: `  ${brut}  ` })
          expect(r.success).toBe(true)
          expect(r.data).toMatchObject({ nom: brut.trim() })
        },
      ),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : un nom de site fait de caractères invisibles est accepté',
    () => {
      // Attendu : CHECK (length(trim(nom)) > 0) + index UNIQUE sur lower(nom).
      // Observé : U+200B / U+202E passent le `.trim()` JS et le `trim()` SQL →
      // un site apparaît « vide » dans le sélecteur de site (SiteSwitcher), et
      // toute la navigation « mes sites » se fait sur une entrée non nommée.
      for (const invisible of CHAINES_INVISIBLES) {
        expect(rejette(siteSchema, { ...SITE, nom: invisible })).toBe(true)
      }
    },
  )

  it.fails('BUG CANDIDAT Martin : le code postal n’a aucun format', () => {
    // Attendu : un code postal est une suite de chiffres/lettres/espaces/
    // tirets (5 chiffres en France, formats étrangers admis dans 20 caractères).
    // Observé : `z.string().trim().max(20)` accepte '<script>', '../../etc' ou
    // "'; DROP TABLE" — pas un risque d'exécution (React échappe, PostgREST
    // paramètre), mais une donnée d'adresse inexploitable pour un courrier ou
    // un export.
    for (const charge of CHARGES_INJECTION) {
      const valeur = charge.slice(0, 20)
      if (valeur.trim() === '') continue
      if (/^[0-9A-Za-z -]+$/.test(valeur)) continue
      expect(rejette(siteSchema, { ...SITE, code_postal: valeur })).toBe(true)
    }
  })
})
