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
import { batimentSchema, localSchema, niveauSchema } from './schemas'

/**
 * Oracles (source : `schema_complete.sql`) :
 *
 *   locaux.surface_m2          NUMERIC(8,2)  CHECK (surface_m2 IS NULL OR surface_m2 > 0)
 *                              → 0 INTERDIT, maximum 999 999,99
 *   locaux.hauteur_m           NUMERIC(4,2)  CHECK (hauteur_m IS NULL OR hauteur_m > 0)
 *                              → 0 INTERDIT, maximum 99,99
 *   locaux.capacite_personnes  SMALLINT      CHECK (… >= 0)  → maximum 32 767
 *   locaux.type_local_id       SMALLINT REFERENCES types_locaux(id)
 *   niveaux.ordre              SMALLINT NOT NULL DEFAULT 0
 *                              commentaire SQL : « tri logique (SS=-1, RDC=0, R+1=1…) »
 *   CHECK (length(trim(nom)) > 0) sur batiments / niveaux / locaux
 */

const BATIMENT = { nom: 'Tour A', description: '', miniature_id: null }
const NIVEAU = { nom: 'RDC', description: '', ordre: '0', miniature_id: null }
const LOCAL = {
  nom: 'Hall d’accueil',
  description: '',
  surface_m2: '',
  type_local_id: '',
  miniature_id: null,
  chauffe_climatise: false,
  hauteur_m: '',
  capacite_personnes: '',
  accessible_pmr: false,
}

// ─── batimentSchema ──────────────────────────────────────────────────────────

describe('batimentSchema', () => {
  testeTotalite('batimentSchema', batimentSchema)
  testeRejetBlanc('batimentSchema', batimentSchema, BATIMENT, ['nom'])
  testeBorneTexte('batimentSchema', batimentSchema, BATIMENT, 'nom', 200)
  testeBorneTexte(
    'batimentSchema',
    batimentSchema,
    BATIMENT,
    'description',
    2000,
  )
  testeIdempotence('batimentSchema', batimentSchema, BATIMENT)

  it.fails(
    'BUG CANDIDAT Martin : un nom fait de caractères invisibles est accepté',
    () => {
      // Attendu : un bâtiment doit porter un nom lisible.
      // Observé : U+200B / U+202E survivent au `.trim()` JS ET au `trim()` SQL
      // du CHECK `length(trim(nom)) > 0` → un bâtiment « sans nom » dans l'arbre
      // des localisations, introuvable par la recherche.
      for (const invisible of CHAINES_INVISIBLES) {
        expect(rejette(batimentSchema, { ...BATIMENT, nom: invisible })).toBe(
          true,
        )
      }
    },
  )
})

// ─── niveauSchema ────────────────────────────────────────────────────────────

describe('niveauSchema — ordre', () => {
  testeTotalite('niveauSchema', niveauSchema)
  testeRejetBlanc('niveauSchema', niveauSchema, NIVEAU, ['nom'])
  testeBorneTexte('niveauSchema', niveauSchema, NIVEAU, 'nom', 200)

  it('accepte un ordre entier positif, et le vide', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 32_767 }), (n) => {
        const r = niveauSchema.safeParse({ ...NIVEAU, ordre: String(n) })
        expect(r.success).toBe(true)
        expect(r.data).toMatchObject({ ordre: n })
      }),
      RUNS,
    )
    const vide = niveauSchema.safeParse({ ...NIVEAU, ordre: '   ' })
    expect(vide.success).toBe(true)
    expect(vide.data).toMatchObject({ ordre: undefined })
  })

  it('refuse ce que Number() rend NaN', () => {
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        const t = texte.trim()
        if (t === '' || !Number.isNaN(Number(t))) return
        expect(rejette(niveauSchema, { ...NIVEAU, ordre: texte })).toBe(true)
      }),
      RUNS,
    )
  })

  it('accepte un ordre NÉGATIF, pour ranger un sous-sol avant le rez-de-chaussée', () => {
    // ORACLE : le schéma SQL documente lui-même l'usage — « tri logique
    // (SS=-1, RDC=0, R+1=1…) » sur une colonne SMALLINT SIGNÉE.
    // Régression couverte : un helper qui refuserait `n < 0` rend impossible le
    // placement d'un sous-sol AVANT le rez-de-chaussée depuis le formulaire, et
    // contraint l'usager à renuméroter tout le bâtiment de +1.
    fc.assert(
      fc.property(fc.integer({ min: -32_768, max: -1 }), (n) => {
        const r = niveauSchema.safeParse({ ...NIVEAU, ordre: String(n) })
        expect(r.success).toBe(true)
        expect(r.data).toMatchObject({ ordre: n })
      }),
      RUNS,
    )
    const sousSol = niveauSchema.safeParse({ ...NIVEAU, ordre: '-1' })
    expect(sousSol.success).toBe(true)
    expect(sousSol.data).toMatchObject({ ordre: -1 })
  })

  it.fails(
    'BUG CANDIDAT Martin : l’ordre accepte l’infini, l’hexadécimal et le hors-borne SMALLINT',
    () => {
      // Attendu : `niveaux.ordre` est un SMALLINT (−32 768 … 32 767) entier.
      // Observé : 'Infinity' accepté (Number.isNaN seul), '0x10' réinterprété en
      // 16, '0.5' accepté puis ARRONDI EN SILENCE par Postgres, '99999' accepté
      // puis rejeté par la base (22003).
      for (const v of ['Infinity', '0x10', '0.5', '99999']) {
        expect(rejette(niveauSchema, { ...NIVEAU, ordre: v })).toBe(true)
      }
    },
  )
})

// ─── localSchema : surface ───────────────────────────────────────────────────

describe('localSchema — surface', () => {
  testeTotalite('localSchema', localSchema)
  testeRejetBlanc('localSchema', localSchema, LOCAL, ['nom'])
  testeBorneTexte('localSchema', localSchema, LOCAL, 'nom', 200)
  testeBorneTexte('localSchema', localSchema, LOCAL, 'description', 2000)

  it('accepte une surface strictement positive dans la borne NUMERIC(8,2)', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: 0.01,
          max: 999_999,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (n) => {
          const r = localSchema.safeParse({ ...LOCAL, surface_m2: String(n) })
          expect(r.success).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it('refuse une surface négative (miroir du CHECK surface_m2 > 0)', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -1e6,
          max: -0.01,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (n) => {
          expect(
            rejette(localSchema, { ...LOCAL, surface_m2: String(n) }),
          ).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : une surface de 0 m² est acceptée alors que le CHECK exige > 0',
    () => {
      // Attendu : CHECK (surface_m2 IS NULL OR surface_m2 > 0) — un local de
      // 0 m² n'existe pas. Observé : `optionalNumber` ne refuse que `n < 0`,
      // donc '0', '0.00' et '-0' passent → INSERT rejeté par la base en 23514,
      // message générique « Valeur refusée : elle ne respecte pas une règle. »
      // Contre-exemples : '0', '0.0', '-0'.
      for (const v of ['0', '0.0', '-0', '0,0'.replace(',', '.')]) {
        expect(rejette(localSchema, { ...LOCAL, surface_m2: v })).toBe(true)
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : la surface n’a pas de borne haute (NUMERIC(8,2))',
    () => {
      // Attendu : NUMERIC(8,2) plafonne à 999 999,99 m².
      // Observé : '1e7' (10 000 000) et 'Infinity' acceptés → 22003 côté base.
      for (const v of ['1000000', '1e7', '1e300', 'Infinity']) {
        expect(rejette(localSchema, { ...LOCAL, surface_m2: v })).toBe(true)
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : une surface hexadécimale est RÉINTERPRÉTÉE',
    () => {
      // Attendu : rejet. Observé : Number('0x10') === 16 → un local saisi
      // « 0x10 » s'enregistre avec 16 m², sans le moindre avertissement.
      expect(rejette(localSchema, { ...LOCAL, surface_m2: '0x10' })).toBe(true)
    },
  )
})

// ─── localSchema : hauteur et effectif (migration 111) ───────────────────────

describe('localSchema — hauteur sous plafond', () => {
  it('accepte une hauteur plausible', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 99, noNaN: true, noDefaultInfinity: true }),
        (n) => {
          expect(
            localSchema.safeParse({ ...LOCAL, hauteur_m: String(n) }).success,
          ).toBe(true)
        },
      ),
      RUNS,
    )
  })

  it.fails(
    'BUG CANDIDAT Martin : hauteur 0 acceptée alors que locaux_hauteur_positive exige > 0',
    () => {
      // Attendu : CONSTRAINT locaux_hauteur_positive CHECK (hauteur_m > 0).
      // Observé : '0' passe le front (n < 0 seul est refusé) → 23514.
      expect(rejette(localSchema, { ...LOCAL, hauteur_m: '0' })).toBe(true)
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : hauteur sans borne haute (NUMERIC(4,2) → 99,99 m max)',
    () => {
      // Attendu : au-delà de 99,99 la base lève 22003.
      // Observé : '100', '1000' et 'Infinity' acceptés par le formulaire.
      for (const v of ['100', '1000', 'Infinity', '0x10']) {
        expect(rejette(localSchema, { ...LOCAL, hauteur_m: v })).toBe(true)
      }
    },
  )
})

describe('localSchema — effectif admissible', () => {
  it('n’accepte qu’un ENTIER positif ou nul', () => {
    // Oracle : CHECK (capacite_personnes >= 0) ; un effectif est un compte.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 32_767 }), (n) => {
        const r = localSchema.safeParse({
          ...LOCAL,
          capacite_personnes: String(n),
        })
        expect(r.success).toBe(true)
        expect(r.data).toMatchObject({ capacite_personnes: n })
      }),
      RUNS,
    )
    for (const v of ['3.5', '-1', 'Infinity', 'NaN', 'douze']) {
      expect(rejette(localSchema, { ...LOCAL, capacite_personnes: v })).toBe(
        true,
      )
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : l’effectif dépasse la capacité d’un SMALLINT',
    () => {
      // Attendu : `capacite_personnes SMALLINT` → 32 767 au maximum.
      // Observé : '99999' et '1e9' (entiers au sens de Number.isInteger)
      // acceptés par le formulaire → 22003 côté base.
      for (const v of ['32768', '99999', '1e9']) {
        expect(rejette(localSchema, { ...LOCAL, capacite_personnes: v })).toBe(
          true,
        )
      }
    },
  )

  it.fails(
    'BUG CANDIDAT Martin : un effectif hexadécimal est RÉINTERPRÉTÉ',
    () => {
      // Observé : Number('0x10') === 16 et Number.isInteger(16) → accepté.
      expect(
        rejette(localSchema, { ...LOCAL, capacite_personnes: '0x10' }),
      ).toBe(true)
    },
  )
})

describe('localSchema — type de local', () => {
  it('n’accepte qu’un identifiant entier, ou le vide', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 32_767 }), (n) => {
        const r = localSchema.safeParse({ ...LOCAL, type_local_id: String(n) })
        expect(r.success).toBe(true)
        expect(r.data).toMatchObject({ type_local_id: n })
      }),
      RUNS,
    )
    for (const v of ['1.5', 'bureau', 'NaN']) {
      expect(rejette(localSchema, { ...LOCAL, type_local_id: v })).toBe(true)
    }
  })

  it.fails(
    'BUG CANDIDAT Martin : type_local_id accepte un id négatif ou hors SMALLINT',
    () => {
      // Attendu : `type_local_id SMALLINT REFERENCES types_locaux(id)` — les id
      // du référentiel sont positifs et tiennent dans un SMALLINT.
      // Observé : '-5' (→ 23503, FK introuvable) et '1e20' (→ 22003) acceptés.
      for (const v of ['-5', '1e20', '0x10']) {
        expect(rejette(localSchema, { ...LOCAL, type_local_id: v })).toBe(true)
      }
    },
  )
})

describe('localSchema — booléens', () => {
  it('exige de vrais booléens pour chauffe_climatise et accessible_pmr', () => {
    // Oracle : colonnes BOOLEAN NOT NULL — une chaîne 'false' serait VRAIE en JS.
    for (const champ of ['chauffe_climatise', 'accessible_pmr']) {
      for (const v of ['true', 'false', 0, 1, null, 'oui']) {
        expect(rejette(localSchema, { ...LOCAL, [champ]: v })).toBe(true)
      }
    }
  })
})

describe('localSchema — déterminisme', () => {
  it('parser deux fois la même entrée donne exactement la même sortie', () => {
    // Le schéma TRANSFORME (texte → nombre) : la sortie n'est pas une entrée
    // légale, l'idempotence au sens strict ne s'applique pas. Ce qui doit tenir,
    // c'est le déterminisme — sinon deux soumissions du même formulaire
    // écriraient des valeurs différentes.
    fc.assert(
      fc.property(
        arbChaineHostile(),
        arbChaineHostile(),
        (surface, hauteur) => {
          const entree = { ...LOCAL, surface_m2: surface, hauteur_m: hauteur }
          const a = localSchema.safeParse(entree)
          const b = localSchema.safeParse(entree)
          expect(a.success).toBe(b.success)
          expect(a.data).toEqual(b.data)
        },
      ),
      RUNS,
    )
  })
})
