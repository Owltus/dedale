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
import { tacheSchema } from '@/features/equipements/tache-schema'
import { clotureSchema, evenementSchema } from './schemas'

/**
 * Oracles (source : `schema_complete.sql`) :
 *   evenements.titre           TEXT NOT NULL CHECK (length(trim(titre)) > 0)
 *   evenements.date_evenement  DATE NOT NULL DEFAULT current_date
 *   evenements.local_id / equipement_id  UUID (facultatifs)
 *   evenements_dates_coherentes  CHECK (date_cloture IS NULL OR date_cloture >= date_evenement)
 *   evenements_lieux.libelle   TEXT NOT NULL   (une tâche porte un libellé)
 *
 * Le libellé de tâche a une définition de référence : `tacheSchema`
 * (features/equipements/tache-schema.ts) — « un libellé libre est son IDENTITÉ
 * (seul champ requis) », borné à 200 caractères.
 */

const EVENEMENT = {
  titre: 'Dégât des eaux au 2e étage',
  description: '',
  date_evenement: '2026-03-12',
  local_id: '',
  equipement_id: '',
  taches: [],
}

const TACHE = { libelle: 'Assécher la zone', local_id: '', equipement_id: '' }

describe('evenementSchema', () => {
  testeTotalite('evenementSchema', evenementSchema)
  testeRejetBlanc('evenementSchema', evenementSchema, EVENEMENT, ['titre'])
  testeBorneTexte('evenementSchema', evenementSchema, EVENEMENT, 'titre', 200)
  testeBorneTexte(
    'evenementSchema',
    evenementSchema,
    EVENEMENT,
    'description',
    5000,
  )
  testeIdempotence('evenementSchema', evenementSchema, EVENEMENT)

  it('exige une date d’événement', () => {
    expect(rejette(evenementSchema, { ...EVENEMENT, date_evenement: '' })).toBe(
      true,
    )
  })

  it('exige un TABLEAU de tâches (jamais null ni un objet)', () => {
    for (const v of [null, undefined, {}, 'taches', 0]) {
      expect(rejette(evenementSchema, { ...EVENEMENT, taches: v })).toBe(true)
    }
    expect(
      evenementSchema.safeParse({ ...EVENEMENT, taches: [TACHE] }).success,
    ).toBe(true)
  })

  it.fails(
    'BUG CANDIDAT Martin : un titre fait de caractères invisibles est accepté',
    () => {
      // Attendu : CHECK (length(trim(titre)) > 0) veut un titre lisible.
      // Observé : U+200B / U+202E passent le `.trim()` JS et le `trim()` SQL.
      for (const invisible of CHAINES_INVISIBLES) {
        expect(
          rejette(evenementSchema, { ...EVENEMENT, titre: invisible }),
        ).toBe(true)
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : date_evenement accepte n’importe quel texte',
    () => {
      // Attendu : colonne DATE. Observé : `z.string().min(1)` → 22007 brut.
      fc.assert(
        fc.property(arbChaineHostile(), (texte) => {
          if (texte.trim() === '') return
          if (/^\d{4}-\d{2}-\d{2}$/.test(texte.trim())) return
          expect(
            rejette(evenementSchema, { ...EVENEMENT, date_evenement: texte }),
          ).toBe(true)
        }),
        RUNS,
      )
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : le libellé de tâche INLINE ignore la définition de référence',
    () => {
      // Attendu : `tacheSchema` — la brique partagée qui définit CE QU'EST une
      // tâche — exige `libelle` non blanc et ≤ 200 caractères. Le tableau
      // `taches` du formulaire d'événement doit dire la même chose.
      // Observé : il redéclare `libelle: z.string()` NU → ni minimum ni maximum.
      // Contre-exemples : libellé de 100 000 caractères, et libellé '   '.
      // Conséquence : `evenements_lieux.libelle` (TEXT NOT NULL, sans CHECK de
      // non-vacuité) accepte la ligne — une tâche sans intitulé, impossible à
      // pointer dans la checklist.
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('   '),
            fc.constant('x'.repeat(100_000)),
            fc.constant('x'.repeat(201)),
          ),
          (libelle) => {
            const viaReference = tacheSchema.safeParse({
              libelle,
              local_id: '',
              equipement_id: '',
              commentaire: '',
              date_tache: '',
            }).success
            const viaFormulaire = evenementSchema.safeParse({
              ...EVENEMENT,
              taches: [{ libelle, local_id: '', equipement_id: '' }],
            }).success
            expect(viaFormulaire).toBe(viaReference)
          },
        ),
        RUNS,
      )
    },
  )

  it.fails('BUG CANDIDAT Martin : le nombre de tâches n’est pas borné', () => {
    // Attendu : une checklist d'événement se borne (l'écran en affiche une
    // liste, la mutation les insère une par une).
    // Observé : `z.array(...)` sans `.max()` → 10 000 tâches acceptées, soit
    // 10 000 INSERT déclenchés par une seule soumission.
    expect(
      rejette(evenementSchema, {
        ...EVENEMENT,
        taches: Array.from({ length: 10_000 }, () => ({ ...TACHE })),
      }),
    ).toBe(true)
  })
})

describe('clotureSchema — événement', () => {
  testeTotalite('clotureSchema', clotureSchema)

  it('exige la date de clôture, PAS le compte-rendu', () => {
    // Oracle : commentaire du schéma — « la BASE ne l'impose pas : un événement
    // peut être clos sans qu'aucune action ait été nécessaire ».
    expect(
      rejette(clotureSchema, { date_cloture: '', compte_rendu: 'RAS' }),
    ).toBe(true)
    expect(
      clotureSchema.safeParse({ date_cloture: '2026-03-13', compte_rendu: '' })
        .success,
    ).toBe(true)
  })

  it('borne le compte-rendu à 5000 caractères', () => {
    expect(
      clotureSchema.safeParse({
        date_cloture: '2026-03-13',
        compte_rendu: 'a'.repeat(5000),
      }).success,
    ).toBe(true)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (surplus) => {
        expect(
          rejette(clotureSchema, {
            date_cloture: '2026-03-13',
            compte_rendu: 'a'.repeat(5000 + surplus),
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : la clôture n’est pas comparée à la date de l’événement',
    () => {
      // Attendu : CONSTRAINT evenements_dates_coherentes
      //   CHECK (date_cloture IS NULL OR date_cloture >= date_evenement).
      // Le front doit refuser une clôture ANTÉRIEURE à l'événement, comme il le
      // fait pour les contrats (quatre `refine` de cohérence de dates).
      // Observé : `clotureSchema` ne reçoit même pas `date_evenement` — il ne
      // peut rien vérifier. L'UPDATE part, la base lève 23514 sur une contrainte
      // ABSENTE de `MESSAGES_CONTRAINTE_CHECK` → message générique.
      // Contre-exemple : événement du 2026-03-12 clos au 1990-01-01.
      expect(
        rejette(clotureSchema, {
          date_cloture: '1990-01-01',
          compte_rendu: '',
          date_evenement: EVENEMENT.date_evenement,
        }),
      ).toBe(true)
    },
  )
})
