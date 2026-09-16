import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CHAINES_INVISIBLES,
  CHARGES_INJECTION,
  RUNS,
  RUNS_COURT,
  arbChaineHostile,
  arbCoupleDates,
  arbDateIso,
  rejette,
  testeBorneTexte,
  testeIdempotence,
  testeRejetBlanc,
  testeTotalite,
} from '@/lib/hostile-inputs.test'
import {
  TYPE_CONTRAT_TACITE,
  avenantSchema,
  contratSchema,
  prestataireSchema,
  resiliationSchema,
} from './schemas'

/**
 * Oracles de ce fichier (source : `schema_complete.sql`, table `contrats`) :
 *   contrats_reference_non_vide              length(trim(reference)) > 0
 *   contrats_date_fin_apres_debut            date_fin IS NULL OR date_debut <= date_fin
 *   contrats_date_signature_avant_debut      date_signature <= date_debut
 *   contrats_date_resiliation_apres_debut    date_resiliation >= date_debut
 *   contrats_date_notification_avant_resiliation  date_notification <= date_resiliation
 *   contrats_preavis_positif                 delai_preavis_jours >= 0 (NOT NULL DEFAULT 30)
 *   contrats_cycle_positif                   duree_cycle_mois > 0
 *   contrats_fenetre_positive                fenetre_resiliation_jours > 0
 *   colonnes date_*                          type DATE (un texte libre lève 22007)
 *   prestataires_commentaires_taille         length(commentaires) <= 5000
 */

const PRESTATAIRE = {
  libelle: 'Eurofeu',
  commentaires: 'Contrôle des extincteurs.',
  miniature_id: null,
}

const CONTRAT = {
  reference: 'CTR-2026-001',
  type_contrat_id: '1',
  date_debut: '2026-01-01',
  date_fin: '',
  objet_avenant: '',
  commentaires: '',
  duree_cycle_mois: null,
  delai_preavis_jours: 30,
  fenetre_resiliation_jours: null,
  date_signature: '',
  date_resiliation: '',
  date_notification: '',
}

const AVENANT = { ...CONTRAT, objet_avenant: 'Revalorisation tarifaire' }

// ─── prestataireSchema ───────────────────────────────────────────────────────

describe('prestataireSchema', () => {
  testeTotalite('prestataireSchema', prestataireSchema)
  testeRejetBlanc('prestataireSchema', prestataireSchema, PRESTATAIRE, [
    'libelle',
  ])
  testeBorneTexte(
    'prestataireSchema',
    prestataireSchema,
    PRESTATAIRE,
    'libelle',
    200,
  )
  testeBorneTexte(
    'prestataireSchema',
    prestataireSchema,
    PRESTATAIRE,
    'commentaires',
    2000,
  )
  testeIdempotence('prestataireSchema', prestataireSchema, PRESTATAIRE)

  it('détoure le libellé AVANT d’en mesurer la longueur', () => {
    // Oracle : `.trim()` précède `.min(1)`/`.max(200)` dans le schéma — coller
    // depuis un tableur ne doit ni faire échouer ni consommer la borne.
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (brut) => {
        const valeur = `  ${brut}  `
        const r = prestataireSchema.safeParse({
          ...PRESTATAIRE,
          libelle: valeur,
        })
        if (brut.trim() === '') {
          expect(r.success).toBe(false)
        } else {
          expect(r.success).toBe(true)
          expect(r.data).toMatchObject({ libelle: brut.trim() })
        }
      }),
      RUNS,
    )
  })

  it('accepte les charges d’injection comme du TEXTE ordinaire', () => {
    // Oracle : une GMAO doit pouvoir écrire « <script> » dans un commentaire.
    // La défense n'est pas ici (React échappe, PostgREST paramètre) — ce qui est
    // exigé du schéma, c'est de ne pas jeter et de rester borné.
    for (const charge of CHARGES_INJECTION) {
      const r = prestataireSchema.safeParse({
        ...PRESTATAIRE,
        libelle: charge.slice(0, 200) || 'x',
        commentaires: charge,
      })
      expect(typeof r.success).toBe('boolean')
    }
  })

  it('refuse un libellé fait de seuls caractères invisibles', () => {
    // ORACLE : un prestataire doit porter un nom LISIBLE — un libellé composé
    // du seul U+200B (largeur nulle) ou U+202E (RTL override) n'en est pas un.
    // Régression couverte : il était accepté, et le CHECK SQL
    // `length(trim(nom)) > 0` ne le rattrapait pas non plus (le trim SQL ne
    // retire que l'espace ASCII) — une fiche prestataire au nom invisible,
    // impossible à retrouver en recherche. `texteObligatoire` (lib/texte-zod)
    // exige désormais au moins un caractère visible.
    for (const invisible of CHAINES_INVISIBLES) {
      expect(
        rejette(prestataireSchema, {
          ...PRESTATAIRE,
          libelle: invisible,
        }),
      ).toBe(true)
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : miniature_id n’a aucune borne de longueur',
    () => {
      // Attendu : `miniature_id` est un UUID du pool de vignettes → 36
      // caractères, format contraint. Observé : `z.string().nullable()` accepte
      // 100 000 caractères, envoyés tels quels à PostgREST (erreur 22P02 brute).
      expect(
        rejette(prestataireSchema, {
          ...PRESTATAIRE,
          miniature_id: 'x'.repeat(100_000),
        }),
      ).toBe(true)
    },
  )
})

// ─── contratSchema : cohérence des dates ─────────────────────────────────────

describe('contratSchema — cohérence des dates', () => {
  testeTotalite('contratSchema', contratSchema)
  testeRejetBlanc('contratSchema', contratSchema, CONTRAT, ['reference'])
  testeBorneTexte('contratSchema', contratSchema, CONTRAT, 'reference', 200)
  testeBorneTexte('contratSchema', contratSchema, CONTRAT, 'commentaires', 2000)
  testeBorneTexte('contratSchema', contratSchema, CONTRAT, 'objet_avenant', 500)
  testeIdempotence('contratSchema', contratSchema, CONTRAT)

  it('refuse toute fin ANTÉRIEURE au début (CHECK contrats_date_fin_apres_debut)', () => {
    fc.assert(
      fc.property(arbCoupleDates(), ({ avant, apres }) => {
        const r = contratSchema.safeParse({
          ...CONTRAT,
          date_debut: apres,
          date_fin: avant,
        })
        expect(r.success).toBe(false)
      }),
      RUNS,
    )
  })

  it('accepte une fin postérieure OU ÉGALE au début', () => {
    // Oracle : le CHECK est `date_debut <= date_fin` — l'égalité est licite
    // (contrat d'une journée).
    fc.assert(
      fc.property(arbCoupleDates(), ({ avant, apres }) => {
        expect(
          contratSchema.safeParse({
            ...CONTRAT,
            date_debut: avant,
            date_fin: apres,
          }).success,
        ).toBe(true)
        expect(
          contratSchema.safeParse({
            ...CONTRAT,
            date_debut: avant,
            date_fin: avant,
          }).success,
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse une signature POSTÉRIEURE au début (CHECK contrats_date_signature_avant_debut)', () => {
    fc.assert(
      fc.property(arbCoupleDates(), ({ avant, apres }) => {
        expect(
          rejette(contratSchema, {
            ...CONTRAT,
            date_debut: avant,
            date_signature: apres,
          }),
        ).toBe(true)
        // Égalité licite.
        expect(
          contratSchema.safeParse({
            ...CONTRAT,
            date_debut: avant,
            date_signature: avant,
          }).success,
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse une résiliation ANTÉRIEURE au début (CHECK contrats_date_resiliation_apres_debut)', () => {
    fc.assert(
      fc.property(arbCoupleDates(), ({ avant, apres }) => {
        expect(
          rejette(contratSchema, {
            ...CONTRAT,
            date_debut: apres,
            date_resiliation: avant,
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse une notification POSTÉRIEURE à la résiliation (CHECK contrats_date_notification_avant_resiliation)', () => {
    fc.assert(
      fc.property(arbCoupleDates(), ({ avant, apres }) => {
        expect(
          rejette(contratSchema, {
            ...CONTRAT,
            date_debut: avant,
            date_resiliation: avant,
            date_notification: apres,
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('n’applique le contrôle de notification QUE si la résiliation est posée', () => {
    // Oracle : le CHECK SQL est neutralisé par `date_resiliation IS NULL` — le
    // front doit s'aligner, sinon il bloque une saisie que la base accepte.
    fc.assert(
      fc.property(arbDateIso(), (d) => {
        expect(
          contratSchema.safeParse({
            ...CONTRAT,
            date_notification: d,
            date_resiliation: '',
          }).success,
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('refuse un champ date qui n’est pas une date nue', () => {
    // ORACLE : `contrats.date_debut` est une colonne DATE → le front refuse ce
    // qui n'est pas une date nue `YYYY-MM-DD`.
    // Régression couverte : `z.string().min(1)` laissait passer
    // '<script>alert(1)</script>', '0000-00-00', '2026-13-45'… → erreur Postgres
    // 22007 (invalid_datetime_format) affichée en brut, et surtout : les quatre
    // `refine` de cohérence comparaient alors des chaînes quelconques, donc ne
    // garantissaient plus rien. C'est le format qui rend la comparaison
    // lexicographique légitime — d'où l'ordre de la correction.
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(texte.trim())) return
        if (texte === '') return // vide = « non renseigné », légitime ici
        expect(rejette(contratSchema, { ...CONTRAT, date_debut: texte })).toBe(
          true,
        )
      }),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : type_contrat_id n’a aucune borne ni format',
    () => {
      // Attendu : identifiant d'un référentiel SMALLINT (`types_contrats.id`).
      // Observé : `z.string().min(1)` accepte 100 000 caractères arbitraires.
      expect(
        rejette(contratSchema, {
          ...CONTRAT,
          type_contrat_id: 'x'.repeat(100_000),
        }),
      ).toBe(true)
    },
  )
})

// ─── contratSchema : bornes numériques ───────────────────────────────────────

describe('contratSchema — compteurs', () => {
  it('exige le délai de préavis (colonne NOT NULL DEFAULT 30)', () => {
    expect(
      rejette(contratSchema, { ...CONTRAT, delai_preavis_jours: null }),
    ).toBe(true)
  })

  it('refuse un préavis négatif, non entier, infini ou NaN (CHECK contrats_preavis_positif)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: -1 }), (n) => {
        expect(
          rejette(contratSchema, { ...CONTRAT, delai_preavis_jours: n }),
        ).toBe(true)
      }),
      RUNS,
    )
    for (const v of [1.5, Infinity, -Infinity, NaN]) {
      expect(
        rejette(contratSchema, { ...CONTRAT, delai_preavis_jours: v }),
      ).toBe(true)
    }
    expect(
      contratSchema.safeParse({ ...CONTRAT, delai_preavis_jours: 0 }).success,
    ).toBe(true)
  })

  it('refuse une durée de cycle ≤ 0 ou non entière (CHECK contrats_cycle_positif)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: 0 }), (n) => {
        expect(
          rejette(contratSchema, { ...CONTRAT, duree_cycle_mois: n }),
        ).toBe(true)
      }),
      RUNS,
    )
    for (const v of [0.5, Infinity, NaN]) {
      expect(rejette(contratSchema, { ...CONTRAT, duree_cycle_mois: v })).toBe(
        true,
      )
    }
  })

  it('refuse une fenêtre de résiliation ≤ 0 ou non entière (CHECK contrats_fenetre_positive)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: 0 }), (n) => {
        expect(
          rejette(contratSchema, { ...CONTRAT, fenetre_resiliation_jours: n }),
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('exige la durée de cycle pour une tacite reconduction, et elle seule', () => {
    // Oracle : règle métier du schéma (type « tacite » → cycle obligatoire).
    expect(
      rejette(contratSchema, {
        ...CONTRAT,
        type_contrat_id: TYPE_CONTRAT_TACITE,
        duree_cycle_mois: null,
      }),
    ).toBe(true)
    expect(
      contratSchema.safeParse({
        ...CONTRAT,
        type_contrat_id: TYPE_CONTRAT_TACITE,
        duree_cycle_mois: 12,
      }).success,
    ).toBe(true)
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 5 })
          .filter((s) => s !== TYPE_CONTRAT_TACITE),
        (autreType) => {
          expect(
            contratSchema.safeParse({
              ...CONTRAT,
              type_contrat_id: autreType,
              duree_cycle_mois: null,
            }).success,
          ).toBe(true)
        },
      ),
      RUNS_COURT,
    )
  })
})

// ─── avenantSchema ───────────────────────────────────────────────────────────

describe('avenantSchema', () => {
  testeTotalite('avenantSchema', avenantSchema)

  it('exige un objet d’avenant NON BLANC', () => {
    // Oracle : « un avenant = un nouveau contrat dont l'OBJET est obligatoire ».
    expect(rejette(avenantSchema, { ...CONTRAT, objet_avenant: '' })).toBe(true)
    fc.assert(
      fc.property(fc.stringMatching(/^[ \t\n]+$/), (blanc) => {
        expect(
          rejette(avenantSchema, { ...CONTRAT, objet_avenant: blanc }),
        ).toBe(true)
      }),
      RUNS_COURT,
    )
    expect(avenantSchema.safeParse(AVENANT).success).toBe(true)
  })

  it('hérite de TOUTES les contraintes de date du contrat parent', () => {
    // Oracle : `avenantSchema = contratSchema.refine(...)` — un avenant écrit
    // dans la même table `contrats`, donc sous les mêmes CHECK.
    fc.assert(
      fc.property(arbCoupleDates(), ({ avant, apres }) => {
        expect(
          rejette(avenantSchema, {
            ...AVENANT,
            date_debut: apres,
            date_fin: avant,
          }),
        ).toBe(true)
        expect(
          rejette(avenantSchema, {
            ...AVENANT,
            date_debut: avant,
            date_signature: apres,
          }),
        ).toBe(true)
        expect(
          rejette(avenantSchema, {
            ...AVENANT,
            date_debut: apres,
            date_resiliation: avant,
          }),
        ).toBe(true)
      }),
      RUNS,
    )
  })
})

// ─── resiliationSchema ───────────────────────────────────────────────────────

describe('resiliationSchema', () => {
  testeTotalite('resiliationSchema', resiliationSchema)

  it('exige la date de résiliation', () => {
    expect(
      rejette(resiliationSchema, {
        date_notification: '2026-01-01',
        date_resiliation: '',
      }),
    ).toBe(true)
  })

  it('refuse une notification POSTÉRIEURE à la résiliation', () => {
    fc.assert(
      fc.property(arbCoupleDates(), ({ avant, apres }) => {
        expect(
          rejette(resiliationSchema, {
            date_notification: apres,
            date_resiliation: avant,
          }),
        ).toBe(true)
        expect(
          resiliationSchema.safeParse({
            date_notification: avant,
            date_resiliation: apres,
          }).success,
        ).toBe(true)
        // Égalité licite (notification le jour même).
        expect(
          resiliationSchema.safeParse({
            date_notification: avant,
            date_resiliation: avant,
          }).success,
        ).toBe(true)
      }),
      RUNS,
    )
  })

  it('accepte une notification vide (résiliation sans préavis notifié)', () => {
    fc.assert(
      fc.property(arbDateIso(), (d) => {
        expect(
          resiliationSchema.safeParse({
            date_notification: '',
            date_resiliation: d,
          }).success,
        ).toBe(true)
      }),
      RUNS,
    )
  })
})
