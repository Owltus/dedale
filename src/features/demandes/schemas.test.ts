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

  it('refuse un constat fait de seuls caractères invisibles', () => {
    // ORACLE : le constat EST la demande (il n'y a pas de colonne `titre`, le
    // titre de liste est dérivé du constat) — il doit être lisible.
    // Régression couverte : U+200B / U+202E survivaient au `.trim()` comme au
    // CHECK SQL, et produisaient une demande sans intitulé lisible dans la
    // liste. `texteObligatoire` (lib/texte-zod) exige désormais au moins un
    // caractère visible.
    for (const invisible of CHAINES_INVISIBLES) {
      expect(rejette(diSchema, { ...DI, constat: invisible })).toBe(true)
    }
  })

  it('refuse une date de constat qui n’est pas une date nue', () => {
    // ORACLE : `demandes_intervention.date_constat` est une colonne DATE.
    // Régression couverte : le champ était un `z.string().min(1)` — tout texte
    // non vide passait et Postgres répondait 22007 en brut. Il s'appuie
    // désormais sur `dateObligatoire` (lib/dates-zod).
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        if (texte.trim() === '') return
        if (/^\d{4}-\d{2}-\d{2}$/.test(texte.trim())) return
        expect(rejette(diSchema, { ...DI, date_constat: texte })).toBe(true)
      }),
      RUNS,
    )
  })

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

  it('borne le constat comme la base le fait', () => {
    // ORACLE : `di_constat_taille` (`length(constat) <= 5000`).
    //
    // RÉGRESSION COUVERTE : `diEditSchema.constat` n'avait AUCUN `.max()` →
    // 100 000 caractères acceptés par le formulaire d'édition alors que la
    // création en refuse 4 001. L'UPDATE partait, la base levait un 23514 et
    // l'usager lisait « Valeur refusée : elle ne respecte pas une règle. » en
    // perdant sa saisie. C'est le test de concordance Zod / SQL
    // (`src/lib/concordance-sql.test.ts`) qui a trouvé cette divergence — celle
    // que le présent fichier avait pourtant consignée sans jamais la corriger.
    expect(
      rejette(diEditSchema, { ...DI_EDIT, constat: 'x'.repeat(5001) }),
    ).toBe(true)
  })

  it('applique la même borne que la création', () => {
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
  })
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
