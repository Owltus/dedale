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
import { diEditSchema, diSchema, diTitre } from './schemas'

/**
 * Oracles (source : `schema_complete.sql`, table `demandes_intervention`) :
 *   constat      TEXT NOT NULL CHECK (length(trim(constat)) > 0)
 *   di_constat_taille   CHECK (length(constat) <= 5000)   ← « FIX H, bornes de
 *                       taille sur colonnes TEXT verbose » : défense anti-DoS
 *                       sur les colonnes ÉCRITES par les rôles non-admin.
 *   date_constat DATE NOT NULL DEFAULT current_date
 *   local_id / equipement_id : UUID, facultatifs ('' = aucun côté front)
 */

const DI = {
  constat: 'Fuite au plafond du hall.',
  date_constat: '2026-02-03',
  local_id: '',
  equipement_id: '',
}

const DI_EDIT = { constat: DI.constat, local_id: '', equipement_id: '' }

describe('diSchema — création', () => {
  testeTotalite('diSchema', diSchema)
  testeRejetBlanc('diSchema', diSchema, DI, ['constat'])
  testeBorneTexte('diSchema', diSchema, DI, 'constat', 4000)
  testeIdempotence('diSchema', diSchema, DI)

  it('exige une date de constat', () => {
    expect(rejette(diSchema, { ...DI, date_constat: '' })).toBe(true)
  })

  it('accepte des liaisons vides (demande sans lieu ni équipement)', () => {
    // Oracle : commentaire du schéma — « liaisons et prestataire optionnels ».
    expect(diSchema.safeParse(DI).success).toBe(true)
  })

  it.fails(
    'BUG CANDIDAT Martin : un constat fait de caractères invisibles est accepté',
    () => {
      // Attendu : le constat EST la demande (il n'y a pas de colonne `titre`,
      // le titre de liste est dérivé du constat). Un constat invisible produit
      // une demande sans intitulé lisible dans la liste.
      // Observé : U+200B / U+202E survivent au `.trim()` et au CHECK SQL.
      for (const invisible of CHAINES_INVISIBLES) {
        expect(rejette(diSchema, { ...DI, constat: invisible })).toBe(true)
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : date_constat accepte n’importe quel texte',
    () => {
      // Attendu : colonne DATE. Observé : `z.string().min(1)` → 22007 en brut.
      fc.assert(
        fc.property(arbChaineHostile(), (texte) => {
          if (texte.trim() === '') return
          if (/^\d{4}-\d{2}-\d{2}$/.test(texte.trim())) return
          expect(rejette(diSchema, { ...DI, date_constat: texte })).toBe(true)
        }),
        RUNS,
      )
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : local_id / equipement_id ne sont ni bornés ni typés',
    () => {
      // Attendu : UUID ou chaîne vide. Observé : `z.string()` nu accepte
      // 100 000 caractères quelconques → 22P02 côté PostgREST.
      for (const champ of ['local_id', 'equipement_id']) {
        expect(rejette(diSchema, { ...DI, [champ]: 'x'.repeat(100_000) })).toBe(
          true,
        )
      }
    },
  )
})

describe('diEditSchema — édition', () => {
  testeTotalite('diEditSchema', diEditSchema)
  testeRejetBlanc('diEditSchema', diEditSchema, DI_EDIT, ['constat'])
  testeIdempotence('diEditSchema', diEditSchema, DI_EDIT)

  it.fails(
    'BUG CANDIDAT Martin : le constat n’est PAS borné en édition (aucun .max())',
    () => {
      // Attendu : la même borne qu'à la création, et au plus la borne de la base
      // (`di_constat_taille` : length(constat) <= 5000).
      // Observé : `diEditSchema.constat` n'a AUCUN `.max()` → 100 000 caractères
      // acceptés par le formulaire d'édition alors que la création en refuse
      // 4 001. Conséquence : l'UPDATE part, la base lève 23514 sur une contrainte
      // ABSENTE de `MESSAGES_CONTRAINTE_CHECK` (lib/form.ts) → l'usager lit
      // « Valeur refusée : elle ne respecte pas une règle. » et perd sa saisie.
      // Contre-exemples : 'x'.repeat(4001) (asymétrie) et 'x'.repeat(5001)
      // (rejet garanti par la base).
      expect(
        rejette(diEditSchema, { ...DI_EDIT, constat: 'x'.repeat(5001) }),
      ).toBe(true)
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : création et édition ne partagent pas la même borne',
    () => {
      // Propriété d'ALIGNEMENT : ce que la création refuse, l'édition doit le
      // refuser aussi — sinon la règle dépend de l'écran par lequel on passe.
      fc.assert(
        fc.property(fc.integer({ min: 4001, max: 6000 }), (n) => {
          const texte = 'x'.repeat(n)
          const creation = diSchema.safeParse({ ...DI, constat: texte }).success
          const edition = diEditSchema.safeParse({
            ...DI_EDIT,
            constat: texte,
          }).success
          expect(edition).toBe(creation)
        }),
        RUNS,
      )
    },
  )
})

describe('diTitre', () => {
  it('rend toujours une chaîne non vide, d’au plus 81 caractères', () => {
    // Oracle : le titre de liste est DÉRIVÉ du constat — première ligne,
    // tronquée à 80 caractères suivis de l'ellipse, ou un repli explicite.
    fc.assert(
      fc.property(arbChaineHostile(), (constat) => {
        const titre = diTitre(constat)
        expect(typeof titre).toBe('string')
        expect(titre.length).toBeGreaterThan(0)
        expect(titre.length).toBeLessThanOrEqual(81)
      }),
      RUNS,
    )
  })

  it('ne garde QUE la première ligne', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter((s) => s.trim() !== ''),
        fc.string({ maxLength: 40 }),
        (premiere, reste) => {
          if (/[\r\n]/.test(premiere)) return
          expect(diTitre(`${premiere}\n${reste}`)).toBe(premiere.trim())
        },
      ),
      RUNS,
    )
  })

  it('replie sur un libellé explicite quand la première ligne est blanche', () => {
    expect(diTitre('')).toBe('Demande sans constat')
    expect(diTitre('   \nsuite')).toBe('Demande sans constat')
  })
})
