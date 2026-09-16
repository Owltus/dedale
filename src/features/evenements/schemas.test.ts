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

  it('refuse un titre fait de seuls caractères invisibles', () => {
    // ORACLE : CHECK (length(trim(titre)) > 0) veut un titre lisible.
    // Régression couverte : U+200B / U+202E passaient le `.trim()` JS ET le
    // `trim()` SQL — un événement sans intitulé lisible dans la liste.
    // `texteObligatoire` (lib/texte-zod) exige désormais au moins un caractère
    // visible.
    for (const invisible of CHAINES_INVISIBLES) {
      expect(rejette(evenementSchema, { ...EVENEMENT, titre: invisible })).toBe(
        true,
      )
    }
  })

  it('refuse une date d’événement qui n’est pas une date nue', () => {
    // ORACLE : `evenements.date_evenement` est une colonne DATE.
    // Régression couverte : le champ était un `z.string().min(1)` — tout texte
    // non vide passait et Postgres répondait 22007 en brut. Il s'appuie
    // désormais sur `dateObligatoire` (lib/dates-zod).
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
  })

  it('juge le libellé de tâche INLINE comme la définition de référence', () => {
    // ORACLE : `tacheSchema` — la brique partagée qui définit CE QU'EST une
    // tâche — exige `libelle` non blanc et ≤ 200 caractères. Le tableau
    // `taches` du formulaire d'événement dit la même chose.
    // Régression couverte : le formulaire redéclarait `libelle: z.string()` NU
    // (ni minimum ni maximum), donc `evenements_lieux.libelle` (TEXT NOT NULL,
    // sans CHECK de non-vacuité) acceptait une tâche sans intitulé, impossible
    // à pointer dans la checklist. Le tableau est désormais dérivé de la brique
    // (`tachesInlineSchema`) et ne peut plus en diverger.
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
  })

  it('borne le nombre de tâches', () => {
    // ORACLE : une checklist d'événement se borne (l'écran en affiche une
    // liste, la mutation les insère une par une).
    // Régression couverte : `z.array(...)` était écrit sans `.max()` — 10 000
    // tâches étaient acceptées, soit 10 000 INSERT déclenchés par une seule
    // soumission. La borne vit dans `tachesInlineSchema` (MAX_TACHES).
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

  // `date_evenement` fait désormais PARTIE du schéma de clôture (elle n'est pas
  // saisie : le dialogue la reçoit de la fiche et la pose en valeur par défaut)
  // — c'est ce qui lui permet d'honorer `evenements_dates_coherentes`.
  const CLOTURE = {
    date_cloture: '2026-03-13',
    compte_rendu: '',
    date_evenement: EVENEMENT.date_evenement,
  }

  it('exige la date de clôture, PAS le compte-rendu', () => {
    // Oracle : commentaire du schéma — « la BASE ne l'impose pas : un événement
    // peut être clos sans qu'aucune action ait été nécessaire ».
    expect(rejette(clotureSchema, { ...CLOTURE, date_cloture: '' })).toBe(true)
    expect(clotureSchema.safeParse(CLOTURE).success).toBe(true)
  })

  it('borne le compte-rendu à 5000 caractères', () => {
    expect(
      clotureSchema.safeParse({ ...CLOTURE, compte_rendu: 'a'.repeat(5000) })
        .success,
    ).toBe(true)
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), (surplus) => {
        expect(
          rejette(clotureSchema, {
            ...CLOTURE,
            compte_rendu: 'a'.repeat(5000 + surplus),
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse une clôture antérieure à la date de l’événement', () => {
    // ORACLE : CONSTRAINT evenements_dates_coherentes
    //   CHECK (date_cloture IS NULL OR date_cloture >= date_evenement).
    // Régression couverte : `clotureSchema` ne recevait même pas
    // `date_evenement` — il ne pouvait rien vérifier, l'UPDATE partait et la
    // base levait un 23514 traduit en message générique. La date de l'événement
    // fait maintenant partie du schéma, et un `refine` la compare, comme le font
    // depuis toujours les quatre `refine` de cohérence des contrats.
    expect(
      rejette(clotureSchema, {
        date_cloture: '1990-01-01',
        compte_rendu: '',
        date_evenement: EVENEMENT.date_evenement,
      }),
    ).toBe(true)
    // Même jour : accepté (le CHECK est un `>=`).
    expect(
      clotureSchema.safeParse({
        date_cloture: EVENEMENT.date_evenement,
        compte_rendu: '',
        date_evenement: EVENEMENT.date_evenement,
      }).success,
    ).toBe(true)
  })
})
