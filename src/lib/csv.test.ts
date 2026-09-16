import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formaterCsv, parseCsv, parseCsvIndexe } from './csv'

// Tests de PROPRIÉTÉS (fast-check) sur le lecteur/écrivain CSV. L'oracle de
// référence est la RFC 4180 : le couple (formaterCsv, parseCsv) doit se
// comporter comme un codec — ce qu'on écrit est exactement ce qu'on relit.
// Graine fixe : un contre-exemple trouvé ici est toujours rejouable.
const RUNS = { numRuns: 1000, seed: 42 } as const

/**
 * Alphabet volontairement hostile : tout ce qui casse un lecteur CSV naïf
 * (guillemet, séparateurs, saut de ligne, espaces, accents, emoji). Le `\r`
 * en est EXCLU : il a ses propriétés dédiées plus bas, car c'est là que le
 * codec perd de l'information.
 */
const CARACTERES = [
  'a',
  'Z',
  '0',
  'é',
  'ç',
  'œ',
  '—',
  '€',
  '😀',
  '"',
  ';',
  ',',
  '|',
  '\t',
  ' ',
  '\n',
  '\\',
  "'",
]

const cellule = fc.string({
  unit: fc.constantFrom(...CARACTERES),
  maxLength: 6,
})

/** Matrice RECTANGULAIRE (en-tête + lignes de même largeur), cas réel d'un export. */
const matrice = fc.integer({ min: 1, max: 4 }).chain((largeur) =>
  fc.record({
    entetes: fc.array(cellule, { minLength: largeur, maxLength: largeur }),
    lignes: fc.array(
      fc.array(cellule, { minLength: largeur, maxLength: largeur }),
      { maxLength: 5 },
    ),
  }),
)

/**
 * Prédicat EXACT du filtre de `parseCsv` : une ligne à une seule cellule
 * blanche est écartée. C'est la seule fuite du codec (documentée : ligne
 * blanche parasite en fin de collage) — on la modélise au lieu de l'éviter.
 */
const ligneEffacee = (r: string[]) =>
  r.length === 1 && (r[0] ?? '').trim() === ''

/** Sortie attendue d'un aller-retour : la matrice moins les lignes effacées. */
const attenduApresAllerRetour = (entetes: string[], lignes: string[][]) =>
  [entetes, ...lignes].filter((r) => !ligneEffacee(r))

describe('parseCsv ∘ formaterCsv — aller-retour', () => {
  it('restitue toute matrice, sauf les lignes mono-colonne blanches (non-bijectivité caractérisée)', () => {
    // ORACLE : un codec CSV est l'identité sur les données, à ceci près que
    // `parseCsv` écarte les lignes « entièrement vides ». On affirme donc
    // l'identité MODULO ce filtre, dont la définition est écrite au-dessus —
    // et non « ce que la sortie observée voulait bien donner ».
    fc.assert(
      fc.property(
        matrice,
        fc.constantFrom(';', ',', '\t', '|', '#'),
        ({ entetes, lignes }, delimiteur) => {
          const texte = formaterCsv(entetes, lignes, delimiteur)
          expect(parseCsv(texte, delimiteur)).toEqual(
            attenduApresAllerRetour(entetes, lignes),
          )
        },
      ),
      RUNS,
    )
  })

  it('est une vraie bijection dès qu’aucune ligne mono-colonne n’est blanche', () => {
    // ORACLE : le filtre ne peut frapper qu'une ligne de largeur 1 ; à largeur
    // ≥ 2 le codec est bijectif, sans exception ni cas particulier.
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }).chain((largeur) =>
          fc.record({
            entetes: fc.array(cellule, {
              minLength: largeur,
              maxLength: largeur,
            }),
            lignes: fc.array(
              fc.array(cellule, { minLength: largeur, maxLength: largeur }),
              { maxLength: 5 },
            ),
          }),
        ),
        ({ entetes, lignes }) => {
          expect(parseCsv(formaterCsv(entetes, lignes))).toEqual([
            entetes,
            ...lignes,
          ])
        },
      ),
      RUNS,
    )
  })

  it('perd exactement une ligne par ligne mono-colonne blanche (compte exact)', () => {
    // ORACLE : la perte n'est ni aléatoire ni silencieusement plus large ; le
    // nombre de lignes relues vaut le nombre écrit moins le nombre de lignes
    // blanches mono-colonne.
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constantFrom('', ' ', '\t  '), // lignes blanches
            fc.string({ unit: fc.constantFrom('a', 'é', '1'), minLength: 1 }),
          ),
          { maxLength: 8 },
        ),
        (valeurs) => {
          const lignes = valeurs.map((v) => [v])
          const blanches = lignes.filter(ligneEffacee).length
          const relues = parseCsv(formaterCsv(['Nom'], lignes))
          expect(relues).toHaveLength(1 + lignes.length - blanches)
        },
      ),
      RUNS,
    )
  })
})

describe('parseCsv — totalité', () => {
  it('ne jette jamais, quels que soient le texte et le délimiteur', () => {
    // ORACLE : la source est un copier-coller d'utilisateur, donc arbitraire.
    // Une fonction de lecture d'entrée non fiable doit être TOTALE (elle rend
    // toujours une valeur), jamais partielle.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.string({
            unit: fc.constantFrom(...CARACTERES, '\r'),
            maxLength: 40,
          }),
        ),
        fc.string({ minLength: 1, maxLength: 1 }),
        (texte, delimiteur) => {
          expect(() => parseCsv(texte, delimiteur)).not.toThrow()
        },
      ),
      RUNS,
    )
  })

  it('ne rend jamais de ligne mono-colonne blanche (invariant de sortie)', () => {
    // ORACLE : le filtre final est un INVARIANT du contrat de sortie, pas un
    // nettoyage cosmétique — aucune entrée ne doit pouvoir le contourner.
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(...CARACTERES, '\r'),
          maxLength: 40,
        }),
        (texte) => {
          expect(parseCsv(texte).some(ligneEffacee)).toBe(false)
        },
      ),
      RUNS,
    )
  })

  it('rend toujours au moins une cellule par ligne', () => {
    // ORACLE : une ligne CSV a par définition ≥ 1 champ (éventuellement vide).
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(...CARACTERES, '\r'),
          maxLength: 40,
        }),
        (texte) => {
          expect(parseCsv(texte).every((r) => r.length >= 1)).toBe(true)
        },
      ),
      RUNS,
    )
  })
})

describe('parseCsv — guillemets doublés (RFC 4180)', () => {
  /** Cellules riches en guillemets, jamais blanches (sinon la ligne est filtrée). */
  const celluleCitationnelle = fc
    .string({
      unit: fc.constantFrom('"', '""', 'a', 'é', ';', '\n', ' ', '😀'),
      minLength: 1,
      maxLength: 8,
    })
    .filter((s) => s.trim() !== '')

  it('restitue une cellule quel que soit son nombre de guillemets', () => {
    // ORACLE : RFC 4180 §2.7 — dans un champ protégé, `""` désigne UN
    // guillemet littéral. Le doublage à l'écriture et le dédoublage à la
    // lecture sont réciproques, pour un nombre de guillemets quelconque.
    fc.assert(
      fc.property(celluleCitationnelle, (s) => {
        const relu = parseCsv(formaterCsv(['a'], [[s]]))
        expect(relu[1]?.[0]).toBe(s)
      }),
      RUNS,
    )
  })

  it('lit un champ protégé écrit à la main (échappement manuel)', () => {
    // ORACLE : même réciprocité, mais en construisant le champ protégé
    // nous-mêmes — on teste le lecteur seul, sans dépendre de l'écrivain.
    fc.assert(
      fc.property(celluleCitationnelle, (s) => {
        expect(parseCsv(`"${s.replace(/"/g, '""')}"`)).toEqual([[s]])
      }),
      RUNS,
    )
  })
})

describe('parseCsv — fins de ligne', () => {
  /** Remplace CHAQUE fin de ligne par une variante tirée au sort. */
  const varierFinsDeLigne = (csv: string, choix: number[]) => {
    let k = 0
    return csv.replace(/\r\n|\r|\n/g, () => {
      const variante = ['\n', '\r\n', '\r'][choix[k++ % choix.length] ?? 0]
      return variante ?? '\n'
    })
  }

  it('lit à l’identique un CSV dont chaque fin de ligne est en LF, CRLF ou CR', () => {
    // ORACLE : LF, CRLF et CR désignent la MÊME fin de ligne (Unix / Windows /
    // vieux Mac) ; le résultat ne doit pas dépendre de la machine qui a produit
    // le collage. Cellules SANS saut de ligne et largeur ≥ 2 : ainsi deux fins
    // de ligne ne sont jamais adjacentes — sinon un `\r` suivi d'un `\n` issus
    // de deux remplacements distincts formeraient un CRLF, donc UNE seule fin
    // de ligne (la variation cesserait d'être une simple réécriture).
    const celluleSansSaut = fc.string({
      unit: fc.constantFrom(...CARACTERES.filter((c) => c !== '\n')),
      maxLength: 6,
    })
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }).chain((largeur) =>
          fc.record({
            entetes: fc.array(celluleSansSaut, {
              minLength: largeur,
              maxLength: largeur,
            }),
            lignes: fc.array(
              fc.array(celluleSansSaut, {
                minLength: largeur,
                maxLength: largeur,
              }),
              { maxLength: 5 },
            ),
          }),
        ),
        fc.array(fc.integer({ min: 0, max: 2 }), {
          minLength: 1,
          maxLength: 20,
        }),
        ({ entetes, lignes }, choix) => {
          const csv = formaterCsv(entetes, lignes)
          expect(parseCsv(varierFinsDeLigne(csv, choix))).toEqual(parseCsv(csv))
        },
      ),
      RUNS,
    )
  })

  it('lit à l’identique un CSV entièrement converti en LF, CRLF ou CR', () => {
    // ORACLE : convertir TOUT le fichier dans une convention unique (ce que
    // fait un transfert FTP en mode texte, ou un éditeur qui change de fin de
    // ligne) est une opération neutre, y compris sur les sauts de ligne
    // INTÉRIEURS aux cellules protégées.
    fc.assert(
      fc.property(
        matrice,
        fc.integer({ min: 0, max: 2 }),
        ({ entetes, lignes }, choix) => {
          const csv = formaterCsv(entetes, lignes)
          expect(parseCsv(varierFinsDeLigne(csv, [choix]))).toEqual(
            parseCsv(csv),
          )
        },
      ),
      RUNS,
    )
  })

  // RÉGRESSION : une cellule contenant un `\r` isolé (copier-coller d'un vieux
  // tableur ou d'un PDF) est protégée par des guillemets — RFC 4180 : CR est
  // un caractère de fin de ligne. Tant que `formaterCsv` ne testait que
  // `["<délimiteur>\n]`, la cellule sortait NUE et `parseCsv` (qui normalise
  // `\r` → `\n`) COUPAIT la ligne en deux : formaterCsv(['a'], [['x\ry']])
  // relu [['a'], ['x'], ['y']], donc tout le reste du fichier décalé.
  it('ne coupe pas la ligne d’une cellule à retour chariot isolé', () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom('a', 'é'),
          minLength: 1,
          maxLength: 3,
        }),
        fc.string({
          unit: fc.constantFrom('b', 'ç'),
          minLength: 1,
          maxLength: 3,
        }),
        (avant, apres) => {
          const relu = parseCsv(formaterCsv(['a'], [[`${avant}\r${apres}`]]))
          // Deux lignes (l'en-tête et la donnée), une seule cellule chacune :
          // le contenu reste d'un bloc, aucune colonne ne glisse.
          expect(relu).toHaveLength(2)
          expect(relu[1]).toHaveLength(1)
          expect(relu[1]?.[0]).toContain(avant)
          expect(relu[1]?.[0]).toContain(apres)
        },
      ),
      { numRuns: 200, seed: 42 },
    )
  })

  // BUG CANDIDAT Martin (résiduel, connu et assumé) : une cellule protégée
  // DEVRAIT revenir à l'identique, `\r` compris / `parseCsv` normalise le
  // texte AVANT de parser, guillemets compris : un `\r` intérieur — isolé ou
  // en `\r\n` — revient en `\n`. La cellule n'est plus COUPÉE (cf. le test
  // ci-dessus), mais le CR est encore perdu. Déplacer cette normalisation dans
  // la boucle de lecture est un autre chantier, non ouvert ici.
  it.fails('préserve un retour chariot isolé dans une cellule protégée', () => {
    const s = 'Ligne 1\rLigne 2'
    expect(parseCsv(formaterCsv(['a'], [[s]]))).toEqual([['a'], [s]])
  })

  // BUG CANDIDAT Martin (résiduel) : même cause que ci-dessus, pour un texte
  // multi-lignes saisi sous Windows (ex. une description).
  // formaterCsv(['a'], [['x\r\ny']]) → relu 'x\ny' (le CR est perdu).
  it.fails('préserve un CRLF à l’intérieur d’une cellule protégée', () => {
    const s = 'Ligne 1\r\nLigne 2'
    expect(parseCsv(formaterCsv(['a'], [[s]]))).toEqual([['a'], [s]])
  })
})

describe('parseCsv — BOM UTF-8', () => {
  /** Marque d'ordre des octets U+FEFF, en échappement (invisible autrement). */
  const BOM = '\uFEFF'

  // RÉGRESSION : un CSV préfixé du BOM UTF-8 (ce que produit Excel — et ce que
  // `telechargerCsv` écrit lui-même !) se lit comme le même CSV sans BOM.
  // Sans ce retrait, le BOM resterait collé à la PREMIÈRE cellule d'en-tête
  // (parseCsv(BOM + 'Local;Marque') → [[BOM + 'Local', 'Marque']]) et toute
  // comparaison d'en-tête non « trimée » raterait la première colonne.
  it('lit un CSV préfixé du BOM comme le même CSV sans BOM', () => {
    fc.assert(
      fc.property(matrice, ({ entetes, lignes }) => {
        const csv = formaterCsv(entetes, lignes)
        expect(parseCsv(`${BOM}${csv}`)).toEqual(parseCsv(csv))
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('le BOM n’atteint jamais la première cellule', () => {
    // ORACLE : le BOM est une marque d'encodage, pas une donnée — il n'a rien
    // à faire dans le texte de la première cellule, quel que soit cet en-tête.
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('L', 'o', 'é'), minLength: 1 }),
        (entete) => {
          expect(parseCsv(`${BOM}${entete};b`)[0]?.[0]).toBe(entete)
        },
      ),
      RUNS,
    )
  })

  it('le trim des en-têtes reste un second filet (imports)', () => {
    // ORACLE : String.prototype.trim traite U+FEFF comme un blanc (ECMA-262,
    // production WhiteSpace). Les modules d'import comparent des en-têtes
    // trimés : ce filet-là couvrait SEUL le défaut avant son correctif ; il ne
    // couvre plus désormais que les blancs parasites, et le retrait du BOM ne
    // dépend plus de lui.
    expect((parseCsv(`${BOM}Local;Marque`)[0]?.[0] ?? '').trim()).toBe('Local')
  })
})

describe('parseCsvIndexe — numéros de ligne d’origine', () => {
  it('rend exactement les mêmes cellules que parseCsv', () => {
    // ORACLE : les deux fonctions sont deux VUES du même lecteur ; elles ne
    // peuvent pas diverger sur le découpage, quel que soit le texte.
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(...CARACTERES, '\r'),
          maxLength: 40,
        }),
        (texte) => {
          expect(parseCsvIndexe(texte).map((r) => r.cellules)).toEqual(
            parseCsv(texte),
          )
        },
      ),
      RUNS,
    )
  })

  it('numérote chaque enregistrement comme dans le texte collé', () => {
    // ORACLE : le numéro rapporté à l'utilisateur désigne la ligne de SON
    // fichier. Les lignes blanches sont écartées du résultat mais occupent un
    // rang dans le texte : elles ne doivent décaler aucun numéro suivant.
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constantFrom('', '   ', '\t'), // lignes blanches
            fc.constantFrom('a', 'é', 'b'),
          ),
          { minLength: 1, maxLength: 10 },
        ),
        (valeurs) => {
          const attendu = valeurs
            .map((v, i) => ({ cellules: [v], ligne: i + 1 }))
            .filter((r) => (r.cellules[0] ?? '').trim() !== '')
          expect(parseCsvIndexe(valeurs.join('\n'))).toEqual(attendu)
        },
      ),
      RUNS,
    )
  })

  it('numérote un enregistrement multi-lignes par la ligne où il COMMENCE', () => {
    // ORACLE : une cellule protégée peut porter des sauts de ligne ; le numéro
    // annoncé reste celui de sa première ligne, et les lignes qu'elle occupe
    // comptent pour les enregistrements suivants.
    const texte = 'Nom;Note\r\nA;"deux\r\nlignes"\r\n\r\nB;fin'
    expect(parseCsvIndexe(texte)).toEqual([
      { cellules: ['Nom', 'Note'], ligne: 1 },
      { cellules: ['A', 'deux\nlignes'], ligne: 2 },
      { cellules: ['B', 'fin'], ligne: 5 },
    ])
  })
})

describe('formaterCsv — délimiteur', () => {
  // RÉGRESSION : le délimiteur est une DONNÉE, il est échappé avant d'entrer
  // dans la classe de caractères de l'expression régulière. Interpolé brut,
  // `formaterCsv(['a'], [['b']], '-')` jetait « Range out of order in
  // character class » (la classe devenait ["-\n], soit l'intervalle
  // 0x22..0x0A).
  it('ne jette pour aucun délimiteur d’un caractère', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1 }),
        matrice,
        (delimiteur, { entetes, lignes }) => {
          expect(() => formaterCsv(entetes, lignes, delimiteur)).not.toThrow()
        },
      ),
      { numRuns: 500, seed: 42 },
    )
  })

  it('protège toute cellule contenant le délimiteur, quel qu’il soit', () => {
    // ORACLE : si une cellule contient le séparateur sans protection, le
    // nombre de colonnes relues augmente — donc elle DOIT être protégée.
    fc.assert(
      fc.property(
        fc.constantFrom(';', ',', '\t', '|', '#'),
        fc.string({
          unit: fc.constantFrom('a', 'é'),
          minLength: 1,
          maxLength: 3,
        }),
        (delimiteur, mot) => {
          const cellule2 = `${mot}${delimiteur}${mot}`
          expect(
            parseCsv(
              formaterCsv(['a', 'b'], [[cellule2, mot]], delimiteur),
              delimiteur,
            ),
          ).toEqual([
            ['a', 'b'],
            [cellule2, mot],
          ])
        },
      ),
      RUNS,
    )
  })

  // BUG CANDIDAT Martin : avec `delimiter === '"'` le codec DEVRAIT soit
  // fonctionner, soit refuser explicitement une configuration impossible /
  // il accepte silencieusement et perd toutes les colonnes : dans `parseCsv`
  // la branche `c === '"'` est testée AVANT `c === delimiter`, donc le
  // guillemet n'est jamais lu comme séparateur. Contre-exemple :
  // formaterCsv(['a','b'], [['x','y']], '"') → 'a"b\r\nx"y' relu
  // [['ab\nxy']] — les 2 colonnes ET les 2 lignes fusionnées en UNE cellule.
  it.fails('reste un codec quand le délimiteur est le guillemet', () => {
    expect(parseCsv(formaterCsv(['a', 'b'], [['x', 'y']], '"'), '"')).toEqual([
      ['a', 'b'],
      ['x', 'y'],
    ])
  })
})
