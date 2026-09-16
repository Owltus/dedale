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
import { clotureTravauxSchema, tacheSchema, travauxSchema } from './schemas'

/**
 * Oracles (source : `schema_complete.sql`) :
 *   travaux_taches.libelle  TEXT NOT NULL  (table enfant d'interventions_travaux)
 *   travaux_taches.date_tache  DATE
 *   La date de demande est une colonne DATE.
 *   Définition de référence d'une tâche : `tacheSchema` (module partagé 090) —
 *   libellé requis, ≤ 200 caractères ; commentaire ≤ 2000.
 */

const TRAVAUX = {
  titre: 'Réfection de la toiture terrasse',
  description: '',
  date_demande: '2026-04-02',
  local_id: '',
  equipement_id: '',
  taches: [],
}

const TACHE_INLINE = {
  libelle: 'Déposer l’ancienne étanchéité',
  local_id: '',
  equipement_id: '',
}

describe('travauxSchema', () => {
  testeTotalite('travauxSchema', travauxSchema)
  testeRejetBlanc('travauxSchema', travauxSchema, TRAVAUX, ['titre'])
  testeBorneTexte('travauxSchema', travauxSchema, TRAVAUX, 'titre', 200)
  testeBorneTexte('travauxSchema', travauxSchema, TRAVAUX, 'description', 2000)
  testeIdempotence('travauxSchema', travauxSchema, TRAVAUX)

  it('exige une date de demande', () => {
    expect(rejette(travauxSchema, { ...TRAVAUX, date_demande: '' })).toBe(true)
  })

  it('exige un TABLEAU de tâches', () => {
    for (const v of [null, undefined, {}, 'taches']) {
      expect(rejette(travauxSchema, { ...TRAVAUX, taches: v })).toBe(true)
    }
    expect(
      travauxSchema.safeParse({ ...TRAVAUX, taches: [TACHE_INLINE] }).success,
    ).toBe(true)
  })

  it.fails(
    'BUG CANDIDAT Martin : un titre fait de caractères invisibles est accepté',
    () => {
      // Attendu : un travaux doit porter un intitulé lisible (c'est la clé de
      // lecture de la liste et de la fiche).
      // Observé : U+200B / U+202E survivent au `.trim()`.
      for (const invisible of CHAINES_INVISIBLES) {
        expect(rejette(travauxSchema, { ...TRAVAUX, titre: invisible })).toBe(
          true,
        )
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : date_demande accepte n’importe quel texte',
    () => {
      // Attendu : colonne DATE. Observé : `z.string().min(1)` → 22007 brut.
      fc.assert(
        fc.property(arbChaineHostile(), (texte) => {
          if (texte.trim() === '') return
          if (/^\d{4}-\d{2}-\d{2}$/.test(texte.trim())) return
          expect(
            rejette(travauxSchema, { ...TRAVAUX, date_demande: texte }),
          ).toBe(true)
        }),
        RUNS,
      )
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : le libellé de tâche INLINE ignore `tacheSchema`',
    () => {
      // Même défaut que côté Événements : le formulaire redéclare
      // `libelle: z.string()` nu au lieu de réutiliser la brique partagée.
      // Contre-exemples : '   ' (blanc) et 'x'.repeat(100000).
      fc.assert(
        fc.property(
          fc.constantFrom('   ', 'x'.repeat(201), 'x'.repeat(100_000)),
          (libelle) => {
            const viaReference = tacheSchema.safeParse({
              libelle,
              local_id: '',
              equipement_id: '',
              commentaire: '',
              date_tache: '',
            }).success
            const viaFormulaire = travauxSchema.safeParse({
              ...TRAVAUX,
              taches: [{ libelle, local_id: '', equipement_id: '' }],
            }).success
            expect(viaFormulaire).toBe(viaReference)
          },
        ),
        RUNS,
      )
    },
  )
})

describe('tacheSchema — brique partagée 090', () => {
  const TACHE = {
    libelle: 'Vérifier les évacuations',
    local_id: '',
    equipement_id: '',
    commentaire: '',
    date_tache: '',
  }

  testeTotalite('tacheSchema', tacheSchema)
  testeRejetBlanc('tacheSchema', tacheSchema, TACHE, ['libelle'])
  testeBorneTexte('tacheSchema', tacheSchema, TACHE, 'libelle', 200)
  testeBorneTexte('tacheSchema', tacheSchema, TACHE, 'commentaire', 2000)
  testeIdempotence('tacheSchema', tacheSchema, TACHE)

  it('accepte une date de tâche vide (« aucune date », 093)', () => {
    expect(tacheSchema.safeParse({ ...TACHE, date_tache: '' }).success).toBe(
      true,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : date_tache accepte n’importe quel texte',
    () => {
      // Attendu : `travaux_taches.date_tache` est une colonne DATE.
      // Observé : `z.string()` nu — même 'demain' passe.
      expect(rejette(tacheSchema, { ...TACHE, date_tache: 'demain' })).toBe(
        true,
      )
    },
  )
})

describe('clotureTravauxSchema', () => {
  testeTotalite('clotureTravauxSchema', clotureTravauxSchema)

  it('exige la date de fin, PAS le compte-rendu', () => {
    // Oracle : commentaire du schéma — « 085 : le compte-rendu est désormais
    // FACULTATIF […] le trigger validation_travaux_compte_rendu supprimé ».
    expect(
      rejette(clotureTravauxSchema, { date_fin: '', compte_rendu: 'fait' }),
    ).toBe(true)
    expect(
      clotureTravauxSchema.safeParse({
        date_fin: '2026-05-20',
        compte_rendu: '',
      }).success,
    ).toBe(true)
  })

  it('borne le compte-rendu à 5000 caractères', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (surplus) => {
        expect(
          rejette(clotureTravauxSchema, {
            date_fin: '2026-05-20',
            compte_rendu: 'a'.repeat(5000 + surplus),
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })
})
