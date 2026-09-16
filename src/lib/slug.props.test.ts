import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { segOfUnique, slugify } from './slug'

/**
 * Propriétés (fast-check) de l'identité des URL — complément des tests par
 * l'exemple de `slug.test.ts`, qui restent la documentation lisible du module.
 *
 * Enjeu : `segOfUnique` fabrique le segment d'URL de CHAQUE fiche détail de
 * l'application. Deux frères qui produiraient le même segment = un clic qui
 * ouvre la mauvaise fiche (ou une fiche injoignable). C'est donc l'UNICITÉ qui
 * est la propriété centrale, pas la jolie forme du slug.
 *
 * Chaque test cite son ORACLE : la règle qui le rend vrai indépendamment de ce
 * que le code renvoie aujourd'hui.
 */

const CFG = { numRuns: 1000, seed: 42 } as const

// ── Générateurs ───────────────────────────────────────────────────────────────

/** Unités hostiles : NUL, combinantes, ZWJ, `~` (le discriminant), demi-surrogates isolés. */
const uniteHostile = fc.oneof(
  fc.constantFrom(
    '\0',
    '́', // combinante aiguë (plage NFD retirée par slugify)
    '‍', // ZWJ
    '~', // discriminant de segOfUnique
    '-',
    ' ',
    'é',
    'A',
    '0',
    '①',
    '👨',
    '🇫🇷',
  ),
  // Demi-surrogate ISOLÉ : `fc.string({ unit: 'binary' })` les exclut par
  // construction, on les réintroduit à la main.
  fc.integer({ min: 0xd800, max: 0xdfff }).map((c) => String.fromCharCode(c)),
)

/** Nom arbitraire : ascii, unicode complet, graphèmes composés, unités hostiles. */
const nomArbitraire = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: uniteHostile, maxLength: 40 }),
  // Homonymes fréquents dans la vraie vie : c'est là que vivent les collisions.
  fc.constantFrom(
    '',
    '   ',
    '###',
    '①',
    'Pompe',
    'pompe',
    'Électricité',
    'Electricite',
    'Ronde mensuelle',
    '👨‍👩‍👧',
    '🇫🇷',
  ),
)

/** `id` tel que la base les sert : uuid v4 (minuscules, hexa + tirets). */
const idBase = fc.uuid({ version: 4 })

/** Fratrie réaliste : noms quelconques, ids DISTINCTS (garanti par la base). */
const fratrie = fc.uniqueArray(fc.record({ nom: nomArbitraire, id: idBase }), {
  selector: (x) => x.id,
  minLength: 1,
  maxLength: 12,
})

// ── slugify ───────────────────────────────────────────────────────────────────

describe('slugify — propriétés', () => {
  it('est TOTALE : ne jette jamais, quelle que soit la chaîne', () => {
    // ORACLE : `slugify` n'a aucune précondition documentée (contrat : elle PEUT
    // renvoyer ''). Une fonction de présentation appelée sur une donnée de base
    // ne doit jamais faire tomber l'écran, fût-ce sur du texte mal formé.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.string({ unit: 'binary' }),
          fc.string({ unit: 'grapheme' }),
          fc.string({ unit: uniteHostile, maxLength: 60 }),
        ),
        (s) => {
          expect(typeof slugify(s)).toBe('string')
        },
      ),
      CFG,
    )
  })

  it('est TOTALE sur les cas limites nommés (NUL, surrogate isolé, ZWJ, drapeau)', () => {
    // ORACLE : mêmes raisons ; ces valeurs sont citées explicitement pour rester
    // lisibles en cas de régression (fast-check ne les tirerait pas toujours).
    for (const s of [
      '\0',
      '\ud800', // demi-surrogate haut isolé
      '\udfff', // demi-surrogate bas isolé
      '\ud800a',
      '👨‍👩‍👧', // famille (ZWJ)
      '🇫🇷', // drapeau (paire d'indicateurs régionaux)
      '́̂̃',
      '__proto__',
    ]) {
      expect(typeof slugify(s)).toBe('string')
    }
  })

  it('est TOTALE sur une chaîne de 10 000 caractères', () => {
    // ORACLE : aucune borne de longueur au contrat (un constat de DI peut être long).
    fc.assert(
      fc.property(fc.string({ minLength: 10_000, maxLength: 10_000 }), (s) => {
        expect(typeof slugify(s)).toBe('string')
      }),
      { numRuns: 20, seed: 42 },
    )
  })

  it('respecte un ALPHABET FERMÉ : /^([a-z0-9]+(-[a-z0-9]+)*)?$/', () => {
    // ORACLE : la sortie est un segment d'URL. Par construction du code, tout ce
    // qui n'est pas [a-z0-9] est réduit à UN tiret et les tirets de bordure sont
    // élagués → pas de tiret en tête/queue, jamais deux tirets consécutifs.
    // Corollaire exploité par `segOfUnique` : `~` n'appartient JAMAIS à un slug,
    // donc un slug pur ne peut pas être confondu avec un segment désambiguïsé.
    const ALPHABET = /^([a-z0-9]+(-[a-z0-9]+)*)?$/
    fc.assert(
      fc.property(nomArbitraire, (s) => {
        expect(slugify(s)).toMatch(ALPHABET)
      }),
      CFG,
    )
  })

  it('est IDEMPOTENTE : slugify(slugify(s)) === slugify(s)', () => {
    // ORACLE : la sortie appartient déjà à l'alphabet fermé et ne contient ni
    // diacritique, ni majuscule, ni tiret de bordure → le second passage est
    // l'identité. Indispensable : un segment relu depuis l'URL est re-slugifié
    // côté résolution, il doit se retrouver à l'identique.
    fc.assert(
      fc.property(nomArbitraire, (s) => {
        const une = slugify(s)
        expect(slugify(une)).toBe(une)
      }),
      CFG,
    )
  })
})

// ── segOfUnique : unicité et symétrie ─────────────────────────────────────────

describe('segOfUnique — unicité parmi les frères', () => {
  it('produit des segments DEUX À DEUX DISTINCTS (ids uuid distincts)', () => {
    // ORACLE (propriété centrale) : le segment est la clef de résolution d'une
    // fiche parmi ses frères. Une application injective des frères vers les
    // segments est la condition NÉCESSAIRE pour qu'un clic ouvre la bonne fiche.
    // Noms arbitraires — identiques, vides, non slugifiables — autorisés : c'est
    // exactement ce que la base permet.
    fc.assert(
      fc.property(fratrie, (sibs) => {
        const segments = sibs.map((x) => segOfUnique(x, sibs))
        expect(new Set(segments).size).toBe(segments.length)
      }),
      { numRuns: 2000, seed: 42 },
    )
  })

  it('est SYMÉTRIQUE génération/résolution : un segment se relit vers son objet', () => {
    // ORACLE : la résolution réelle est un `find` sur le même ensemble de frères.
    // find(y => seg(y) === seg(x)) doit rendre x lui-même — c'est l'injectivité
    // vue du côté de l'appelant, avec en plus la garantie que le premier
    // candidat trouvé est le bon (le `find` s'arrête au premier).
    fc.assert(
      fc.property(fratrie, (sibs) => {
        for (const x of sibs) {
          const cible = segOfUnique(x, sibs)
          expect(sibs.find((y) => segOfUnique(y, sibs) === cible)).toBe(x)
        }
      }),
      { numRuns: 2000, seed: 42 },
    )
  })

  it('est STABLE : même entrée → même segment (pas d’aléa, pas d’ordre)', () => {
    // ORACLE : un segment est mis en signet / partagé. Il doit être une fonction
    // pure du couple (objet, ensemble de frères) — la permutation de la fratrie
    // ne change pas l'ensemble, donc ne doit pas changer le segment.
    fc.assert(
      fc.property(fratrie, (sibs) => {
        const permutee = [...sibs].reverse()
        for (const x of sibs) {
          expect(segOfUnique(x, permutee)).toBe(segOfUnique(x, sibs))
        }
      }),
      CFG,
    )
  })

  it('rend un segment NON VIDE (sinon la fiche se résoudrait vers son parent)', () => {
    // ORACLE : le chemin est assemblé par `join('/')` puis relu par
    // `split('/').filter(Boolean)` — un segment vide disparaît du chemin et
    // l'élément se résout vers son PARENT. C'est le motif même du repli sur l'id.
    fc.assert(
      fc.property(fratrie, (sibs) => {
        for (const x of sibs) {
          expect(segOfUnique(x, sibs).length).toBeGreaterThan(0)
        }
      }),
      CFG,
    )
  })
})

// ── Pièges activement cherchés ────────────────────────────────────────────────

/**
 * Deux chemins mènent à un segment : le SLUG (éventuellement suffixé `~<id[0..8]>`)
 * et le REPLI SUR L'ID. Les deux générateurs ci-dessous construisent, par
 * structure, les deux seules façons de faire converger ces chemins quand les ids
 * sont des uuid. Chaque cas généré EST un contre-exemple : l'échec est
 * déterministe, d'où `it.fails`.
 */

/** Frères homonymes dont les ids partagent les 8 PREMIERS caractères. */
const piegePrefixeCommun = fc
  .tuple(
    fc.uuid({ version: 4 }),
    fc.uuid({ version: 4 }),
    fc.constantFrom('Pompe', 'Ronde mensuelle', 'Local B12'),
  )
  .map(([u1, u2, nom]) => {
    const prefixe = u1.slice(0, 8)
    return [
      { nom, id: `${prefixe}${u1.slice(8)}` },
      { nom, id: `${prefixe}${u2.slice(8)}` },
    ]
  })
  .filter(([a, b]) => a!.id !== b!.id)

/** Un frère non slugifiable + un frère dont le NOM slugifie vers l'id du premier. */
const piegeIdEgaleSlug = fc
  .tuple(fc.uuid({ version: 4 }), fc.uuid({ version: 4 }))
  .filter(([a, b]) => a !== b)
  .map(([idVide, idAutre]) => [
    // slug vide → repli sur l'id → segment = `idVide`
    { nom: '###', id: idVide },
    // un uuid est déjà un slug valide : « ab12cd34 1111 … » se slugifie en `idVide`
    { nom: idVide.replace(/-/g, ' '), id: idAutre },
  ])

describe('segOfUnique — pièges de convergence des deux chemins de segment', () => {
  // BUG CANDIDAT Martin : attendu = segments distincts pour des ids distincts /
  // observé = segment IDENTIQUE pour deux frères homonymes dont les ids
  // partagent leurs 8 premiers caractères (le discriminant `id.slice(0, 8)` ne
  // discrimine plus). Contre-exemple minimal rejouable :
  //   a = { nom: 'Pompe', id: '00000000-0000-4000-8000-000000000001' }
  //   b = { nom: 'Pompe', id: '00000000-0000-4000-8000-000000000002' }
  //   segOfUnique(a, [a, b]) === segOfUnique(b, [a, b]) === 'pompe~00000000'
  it.fails(
    'PIÈGE 1 — ids partageant les 8 premiers caractères : segments identiques',
    () => {
      // ORACLE : inchangé (injectivité des segments sur des ids distincts).
      // On n'affaiblit pas l'assertion, on constate qu'elle ne tient pas.
      fc.assert(
        fc.property(piegePrefixeCommun, (sibs) => {
          const segments = sibs.map((x) => segOfUnique(x, sibs))
          expect(new Set(segments).size).toBe(segments.length)
        }),
        { numRuns: 200, seed: 42 },
      )
    },
  )

  // BUG CANDIDAT Martin : attendu = segments distincts / observé = le repli sur
  // l'id d'un frère non slugifiable produit EXACTEMENT le slug d'un autre frère
  // (un uuid appartient à l'alphabet du slug). Contre-exemple rejouable :
  //   a = { nom: '###', id: '00000000-0000-4000-8000-000000000001' }
  //   b = { nom: '00000000 0000 4000 8000 000000000001', id: '…0002' }
  //   segOfUnique(a, [a, b]) === segOfUnique(b, [a, b])
  //                          === '00000000-0000-4000-8000-000000000001'
  it.fails(
    "PIÈGE 2 — repli sur l'id vs slug d'un frère : segments identiques",
    () => {
      // ORACLE : inchangé. Le repli sur l'id n'est pas marqué (pas de préfixe
      // hors alphabet), il vit donc dans le même espace que les slugs purs.
      fc.assert(
        fc.property(piegeIdEgaleSlug, (sibs) => {
          const segments = sibs.map((x) => segOfUnique(x, sibs))
          expect(new Set(segments).size).toBe(segments.length)
        }),
        { numRuns: 200, seed: 42 },
      )
    },
  )

  it("un segment suffixé n'est JAMAIS confondu avec un slug pur", () => {
    // ORACLE : `~` est hors de l'alphabet fermé de `slugify` (cf. propriété
    // ci-dessus). Un slug pur ne peut donc pas contenir `~` : c'est la garantie
    // qui isole le chemin « désambiguïsation » du chemin « slug ». Cette
    // propriété-ci TIENT — d'où la portée exacte des deux pièges ci-dessus.
    fc.assert(
      fc.property(fratrie, (sibs) => {
        for (const x of sibs) {
          const seg = segOfUnique(x, sibs)
          if (seg.includes('~')) {
            const [slug] = seg.split('~')
            expect(slug).toBe(slugify(x.nom))
            expect(slugify(x.nom)).not.toContain('~')
          }
        }
      }),
      CFG,
    )
  })
})
