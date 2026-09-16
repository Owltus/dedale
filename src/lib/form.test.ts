import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { RUNS, RUNS_COURT } from './hostile-inputs.test'
import {
  deleteErrorMessage,
  errorMessage,
  exportErrorMessage,
  fieldErrors,
  pgCode,
  writeErrorMessage,
} from './form'

/** Fabrique une erreur façon supabase-js (`{ code, message, details }`). */
function pgError(
  code: string,
  message = 'erreur technique brute',
  details = '',
) {
  return { code, message, details }
}

describe('pgCode', () => {
  it('extrait le code string d’une erreur type supabase-js', () => {
    expect(pgCode(pgError('42501'))).toBe('42501')
    expect(pgCode({ code: 'PGRST116' })).toBe('PGRST116')
  })

  it('renvoie undefined quand le code est absent ou non-string', () => {
    expect(pgCode({ message: 'sans code' })).toBeUndefined()
    expect(pgCode({ code: 500 })).toBeUndefined()
  })

  it('renvoie undefined pour null, undefined et primitives', () => {
    expect(pgCode(null)).toBeUndefined()
    expect(pgCode(undefined)).toBeUndefined()
    expect(pgCode('42501')).toBeUndefined()
    expect(pgCode(new Error('boum'))).toBeUndefined()
  })
})

describe('errorMessage', () => {
  it('renvoie le message d’une Error', () => {
    expect(errorMessage(new Error('quelque chose a cassé'))).toBe(
      'quelque chose a cassé',
    )
  })

  it('retombe sur le fallback par défaut pour une non-Error', () => {
    expect(errorMessage({ code: '42501' })).toBe('Une erreur est survenue')
    expect(errorMessage(null)).toBe('Une erreur est survenue')
  })

  it('accepte un fallback personnalisé', () => {
    expect(errorMessage('texte brut', 'Échec sur mesure')).toBe(
      'Échec sur mesure',
    )
  })
})

describe('fieldErrors', () => {
  it('map la première erreur par nom de champ depuis une ZodError', () => {
    const schema = z.object({
      nom: z.string().min(1, 'Le nom est requis'),
      email: z.email('Email invalide'),
    })
    const res = schema.safeParse({ nom: '', email: 'pas-un-email' })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(fieldErrors(res.error)).toEqual({
      nom: 'Le nom est requis',
      email: 'Email invalide',
    })
  })

  it('ne garde que la première erreur rencontrée par champ', () => {
    const schema = z.object({
      code: z
        .string()
        .min(3, 'Trop court')
        .regex(/^[A-Z]+$/, 'Majuscules seulement'),
    })
    const res = schema.safeParse({ code: 'a' })
    expect(res.success).toBe(false)
    if (res.success) return
    const errs = fieldErrors(res.error)
    expect(errs.code).toBe('Trop court')
  })

  it('ignore les issues dont le chemin ne commence pas par une string', () => {
    const schema = z.array(z.string())
    const res = schema.safeParse(['ok', 42])
    expect(res.success).toBe(false)
    if (res.success) return
    // Le chemin est un index numérique → aucun champ nommé collecté.
    expect(fieldErrors(res.error)).toEqual({})
  })
})

describe('exportErrorMessage', () => {
  it('42501 → site hors périmètre', () => {
    expect(exportErrorMessage(pgError('42501'))).toBe(
      'Action non autorisée : vous n’avez pas accès à ce site.',
    )
  })

  it('23505 → élément du même nom déjà présent', () => {
    expect(exportErrorMessage(pgError('23505'))).toBe(
      'Un élément du même nom existe déjà sur ce site (copie déjà effectuée ?).',
    )
  })

  it('P0002 → élément source introuvable', () => {
    expect(exportErrorMessage(pgError('P0002'))).toBe(
      'L’élément source (catégorie ou gamme) est introuvable ou a été supprimé. Rafraîchis la liste puis réessaie.',
    )
  })

  it('code inconnu → repli sur errorMessage', () => {
    expect(exportErrorMessage(new Error('détail brut'))).toBe('détail brut')
    expect(exportErrorMessage(pgError('99999'))).toBe('Une erreur est survenue')
  })
})

describe('deleteErrorMessage', () => {
  it('42501 et PGRST116 → hors périmètre ou déjà supprimé', () => {
    const attendu =
      'Action impossible : élément hors de votre périmètre, ou déjà supprimé.'
    expect(deleteErrorMessage(pgError('42501'))).toBe(attendu)
    expect(deleteErrorMessage(pgError('PGRST116'))).toBe(attendu)
  })

  it('23503 → encore lié par une FK', () => {
    expect(deleteErrorMessage(pgError('23503'))).toBe(
      'Cet élément est encore lié à d’autres données : dissociez-les d’abord.',
    )
  })

  it('code inconnu → repli sur errorMessage', () => {
    expect(deleteErrorMessage(new Error('message base'))).toBe('message base')
    expect(deleteErrorMessage(pgError('23001'))).toBe('Une erreur est survenue')
  })

  it('surcharge contextuelle prioritaire sur le message générique', () => {
    expect(
      deleteErrorMessage(pgError('23503'), {
        '23503': 'Ce local contient encore des équipements.',
      }),
    ).toBe('Ce local contient encore des équipements.')
  })

  it('surcharge sur un code sans message générique', () => {
    expect(
      deleteErrorMessage(pgError('23001'), {
        '23001': 'Suppression bloquée par une règle.',
      }),
    ).toBe('Suppression bloquée par une règle.')
  })
})

describe('writeErrorMessage', () => {
  it('42501 et PGRST116 → hors périmètre ou déjà modifié', () => {
    const attendu =
      'Action impossible : élément hors de votre périmètre, ou déjà modifié.'
    expect(writeErrorMessage(pgError('42501'))).toBe(attendu)
    expect(writeErrorMessage(pgError('PGRST116'))).toBe(attendu)
  })

  it('22003 → montant trop élevé', () => {
    expect(writeErrorMessage(pgError('22003'))).toBe(
      'Montant trop élevé : réduisez la valeur.',
    )
  })

  it('23514 → valeur refusée par une règle (CHECK)', () => {
    expect(writeErrorMessage(pgError('23514'))).toBe(
      'Valeur refusée : elle ne respecte pas une règle.',
    )
  })

  it('23514 → message métier quand la contrainte violée est connue', () => {
    expect(
      writeErrorMessage(
        pgError(
          '23514',
          'new row for relation "ordres_travail" violates check constraint "dates_coherentes"',
        ),
      ),
    ).toBe(
      'Dates incohérentes : la clôture serait antérieure au démarrage. Corrigez les dates d’exécution des opérations.',
    )
  })

  it('23514 → repli générique sur une contrainte inconnue', () => {
    expect(
      writeErrorMessage(
        pgError(
          '23514',
          'new row for relation "x" violates check constraint "contrainte_inconnue"',
        ),
      ),
    ).toBe('Valeur refusée : elle ne respecte pas une règle.')
  })

  it('23505 → doublon (unicité)', () => {
    expect(writeErrorMessage(pgError('23505'))).toBe(
      'Un élément identique existe déjà.',
    )
  })

  it('23503 → référence FK manquante', () => {
    expect(writeErrorMessage(pgError('23503'))).toBe(
      'Référence manquante : un élément lié est introuvable.',
    )
  })

  it('code inconnu → repli sur errorMessage', () => {
    expect(writeErrorMessage(new Error('brut'))).toBe('brut')
    expect(writeErrorMessage(pgError('00000'))).toBe('Une erreur est survenue')
  })

  it('surcharge contextuelle prioritaire sur le message générique', () => {
    expect(
      writeErrorMessage(pgError('23505'), {
        '23505': 'Une catégorie portant ce nom existe déjà à cet emplacement.',
      }),
    ).toBe('Une catégorie portant ce nom existe déjà à cet emplacement.')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Ajouts Martin — branches non couvertes : entrées hostiles, erreurs sans code,
// contraintes CHECK non répertoriées, totalité des traducteurs.
// ─────────────────────────────────────────────────────────────────────────────

/** Erreur façon `PostgrestError` : une VRAIE Error qui porte aussi un `code`. */
function pgErrorReel(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

const GENERIQUE = 'Une erreur est survenue'

describe('pgCode — entrées hostiles', () => {
  it('ne jette jamais et ne rend qu’une string ou undefined', () => {
    // Propriété de TOTALITÉ : `pgCode` est appelé dans tous les `onError` ; s'il
    // jetait, l'échec d'écriture deviendrait un écran blanc.
    fc.assert(
      fc.property(fc.anything(), (e) => {
        const code = pgCode(e)
        expect(code === undefined || typeof code === 'string').toBe(true)
      }),
      RUNS,
    )
  })

  it('lit le code d’une VRAIE Error enrichie (cas PostgrestError)', () => {
    // Oracle : commentaire de `form.ts` — « PostgrestError étend Error ».
    expect(pgCode(pgErrorReel('42501', 'permission denied'))).toBe('42501')
  })

  it('ignore un code non-string, même « numérique »', () => {
    expect(pgCode({ code: 23505 })).toBeUndefined()
    expect(pgCode({ code: null })).toBeUndefined()
    expect(pgCode({ code: ['42501'] })).toBeUndefined()
    expect(pgCode([])).toBeUndefined()
    expect(pgCode(Object.create(null))).toBeUndefined()
  })
})

describe('fieldErrors — cas limites', () => {
  it('rend un objet vide pour une ZodError sans issue nommée', () => {
    const res = z.string().safeParse(42)
    expect(res.success).toBe(false)
    if (res.success) return
    // Chemin vide (la racine) → aucun champ nommé.
    expect(fieldErrors(res.error)).toEqual({})
  })

  it('collecte les erreurs de PLUSIEURS champs, sans en perdre', () => {
    // Propriété : tout champ en erreur apparaît exactement une fois.
    const schema = z.object({
      a: z.string().min(1, 'a requis'),
      b: z.string().min(1, 'b requis'),
      c: z.string().min(1, 'c requis'),
    })
    const res = schema.safeParse({ a: '', b: '', c: '' })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(Object.keys(fieldErrors(res.error)).sort()).toEqual(['a', 'b', 'c'])
  })

  it('ignore un chemin imbriqué dont la racine n’est pas nommée', () => {
    const schema = z.array(z.object({ nom: z.string().min(1, 'requis') }))
    const res = schema.safeParse([{ nom: '' }])
    expect(res.success).toBe(false)
    if (res.success) return
    // Le chemin est [0, 'nom'] : la racine est un index → rien de collecté.
    expect(fieldErrors(res.error)).toEqual({})
  })
})

describe('traducteurs d’erreur — totalité', () => {
  it('rendent TOUJOURS une chaîne non vide, pour n’importe quelle entrée', () => {
    // Propriété : ces trois fonctions alimentent directement un toast. Rendre
    // undefined afficherait un toast vide — un échec silencieux.
    fc.assert(
      fc.property(fc.anything(), (e) => {
        for (const f of [
          writeErrorMessage,
          deleteErrorMessage,
          exportErrorMessage,
        ]) {
          const msg = f(e)
          expect(typeof msg).toBe('string')
          expect(msg.length).toBeGreaterThan(0)
        }
      }),
      RUNS,
    )
  })

  it('replient sur le message générique pour null, undefined et les primitives', () => {
    for (const e of [null, undefined, 0, '', 'texte', true, Symbol('x')]) {
      expect(writeErrorMessage(e)).toBe(GENERIQUE)
      expect(deleteErrorMessage(e)).toBe(GENERIQUE)
      expect(exportErrorMessage(e)).toBe(GENERIQUE)
    }
  })

  it('ne consultent PAS les surcharges quand l’erreur n’a pas de code', () => {
    // Oracle : `const override = code !== undefined ? overrides?.[code] : undefined`.
    // Une surcharge ne doit jamais s'appliquer « par défaut ».
    const surcharges = { '23503': 'Message contextuel' }
    expect(writeErrorMessage(new Error('sans code'), surcharges)).toBe(
      'sans code',
    )
    expect(deleteErrorMessage(new Error('sans code'), surcharges)).toBe(
      'sans code',
    )
  })

  it('n’empruntent PAS une surcharge héritée d’Object.prototype', () => {
    // Piège : `overrides['constructor']` serait truthy sur un objet littéral si
    // l'accès n'était pas comparé à `undefined`. Ici la comparaison stricte
    // protège… tant qu'un code SQLSTATE ne s'appelle pas 'constructor'.
    expect(writeErrorMessage(pgError('23505'), {})).toBe(
      'Un élément identique existe déjà.',
    )
  })

  it('ignorent une surcharge dont le code ne correspond pas', () => {
    expect(
      writeErrorMessage(pgError('23505'), { '23503': 'Autre chose' }),
    ).toBe('Un élément identique existe déjà.')
    expect(
      deleteErrorMessage(pgError('23503'), { '42501': 'Autre chose' }),
    ).toBe(
      'Cet élément est encore lié à d’autres données : dissociez-les d’abord.',
    )
  })
})

describe('writeErrorMessage — contraintes CHECK', () => {
  /**
   * Oracle : les six entrées de `MESSAGES_CONTRAINTE_CHECK` (lib/form.ts). Une
   * entrée non testée est une traduction qu'on peut casser sans s'en apercevoir.
   */
  const TRADUITES: [string, string][] = [
    [
      'dates_coherentes',
      'Dates incohérentes : la clôture serait antérieure au démarrage. Corrigez les dates d’exécution des opérations.',
    ],
    [
      'statut_terminal_a_date_cloture',
      'Date de clôture manquante : un OT clôturé ou annulé doit être horodaté.',
    ],
    ['motif_annulation_oblig_si_annule', 'Motif d’annulation obligatoire.'],
    [
      'motif_reouverture_oblig_si_reouvert',
      'Motif de réouverture obligatoire.',
    ],
    [
      'operations_execution_remplacement_coherent',
      'Remplacement incomplet : renseignez l’ancien ET le nouvel index.',
    ],
    [
      'statut_date_coherents',
      'Date d’exécution incohérente avec le statut de l’opération.',
    ],
  ]

  it('traduit CHACUNE des contraintes répertoriées', () => {
    for (const [contrainte, attendu] of TRADUITES) {
      expect(
        writeErrorMessage(
          pgError(
            '23514',
            `new row for relation "x" violates check constraint "${contrainte}"`,
          ),
        ),
      ).toBe(attendu)
    }
  })

  it('lit aussi la contrainte depuis une VRAIE Error (PostgrestError)', () => {
    // Oracle : `checkConstraintName` accepte une Error comme un objet brut.
    expect(
      writeErrorMessage(
        pgErrorReel(
          '23514',
          'new row for relation "ordres_travail" violates check constraint "dates_coherentes"',
        ),
      ),
    ).toBe(
      'Dates incohérentes : la clôture serait antérieure au démarrage. Corrigez les dates d’exécution des opérations.',
    )
  })

  it('retombe sur le générique quand le message ne nomme aucune contrainte', () => {
    const generique = 'Valeur refusée : elle ne respecte pas une règle.'
    expect(writeErrorMessage(pgError('23514', ''))).toBe(generique)
    expect(writeErrorMessage({ code: '23514' })).toBe(generique)
    expect(
      writeErrorMessage(pgError('23514', 'check constraint sans guillemets')),
    ).toBe(generique)
    // Guillemets non fermés : la regex ne doit pas capturer n'importe quoi.
    expect(
      writeErrorMessage(pgError('23514', 'violates check constraint "ouvert')),
    ).toBe(generique)
  })

  it('n’extrait pas une contrainte d’un message contrefait par l’usager', () => {
    // Un usager peut écrire n'importe quoi dans un champ texte ; ce texte ne
    // doit pas pouvoir piloter le message affiché. Ici le code n'est pas 23514,
    // donc la traduction ne s'applique pas, quoi que dise le message.
    expect(
      writeErrorMessage(
        pgError(
          '22001',
          'violates check constraint "motif_annulation_oblig_si_annule"',
        ),
      ),
    ).toBe(GENERIQUE)
  })

  it.fails(
    'BUG CANDIDAT Martin : des contraintes CHECK atteignables depuis un formulaire ne sont pas traduites',
    () => {
      // Attendu : toute contrainte que le front peut provoquer — parce qu'il ne
      // la reproduit PAS côté saisie — doit avoir un message métier, sinon
      // l'usager lit « Valeur refusée : elle ne respecte pas une règle. » sans
      // savoir quoi corriger, et perd sa saisie.
      // Observé : les contraintes ci-dessous (toutes vérifiables dans
      // schema_complete.sql) tombent sur le message générique. Chacune
      // correspond à un trou de validation documenté par les tests de schéma :
      //   di_constat_taille            ← diEditSchema.constat sans .max()
      //   evenements_dates_coherentes  ← clotureSchema ignore date_evenement
      //   locaux_hauteur_positive      ← hauteur_m accepte 0
      //   locaux_capacite_positive     ← capacite_personnes non bornée
      //   contrats_date_fin_apres_debut ← si la saisie contourne le refine
      const generique = 'Valeur refusée : elle ne respecte pas une règle.'
      for (const contrainte of [
        'di_constat_taille',
        'evenements_dates_coherentes',
        'locaux_hauteur_positive',
        'locaux_capacite_positive',
        'contrats_date_fin_apres_debut',
      ]) {
        expect(
          writeErrorMessage(
            pgError(
              '23514',
              `new row for relation "x" violates check constraint "${contrainte}"`,
            ),
          ),
        ).not.toBe(generique)
      }
    },
  )
})

describe('deleteErrorMessage — codes non traduits', () => {
  it('laisse passer le message FR de la base pour restrict_violation (23001)', () => {
    // Oracle : commentaire de `form.ts` — « le message FR de la base est déjà
    // explicite → tel quel ». Cela n'est vrai que si l'erreur est une Error
    // (c'est le cas de PostgrestError) : avec un objet brut, `errorMessage`
    // retombe sur le générique, ce que le test existant documente déjà.
    expect(
      deleteErrorMessage(
        pgErrorReel(
          '23001',
          'Ce local contient encore 3 équipements : déplacez-les d’abord.',
        ),
      ),
    ).toBe('Ce local contient encore 3 équipements : déplacez-les d’abord.')
  })

  it('distingue bien suppression et écriture sur 42501 / PGRST116', () => {
    // Oracle : « déjà supprimé » vs « déjà modifié » — même code, deux messages.
    expect(deleteErrorMessage(pgError('42501'))).toContain('déjà supprimé')
    expect(writeErrorMessage(pgError('42501'))).toContain('déjà modifié')
  })
})

describe('exportErrorMessage — copie commun → site', () => {
  it('ne traduit QUE les trois codes documentés', () => {
    // Oracle : 42501 (RLS), 23505 (doublon), P0002 (source introuvable).
    const traduits = new Set(['42501', '23505', 'P0002'])
    fc.assert(
      fc.property(
        fc.constantFrom(
          '42501',
          '23505',
          'P0002',
          '23503',
          '22003',
          '23514',
          'PGRST116',
          '00000',
        ),
        (code) => {
          const msg = exportErrorMessage(pgError(code, 'détail technique'))
          if (traduits.has(code)) {
            expect(msg).not.toBe(GENERIQUE)
            expect(msg).not.toBe('détail technique')
          } else {
            expect(msg).toBe(GENERIQUE)
          }
        },
      ),
      RUNS_COURT,
    )
  })

  it('ne consulte pas la contrainte CHECK (pas de branche 23514 ici)', () => {
    expect(
      exportErrorMessage(
        pgError(
          '23514',
          'violates check constraint "check_gamme_modele_meme_perimetre"',
        ),
      ),
    ).toBe(GENERIQUE)
  })
})
