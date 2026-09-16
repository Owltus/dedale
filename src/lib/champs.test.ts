import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CHAMP_TYPES,
  champSchema,
  formatChampValeur,
  parseChamps,
  parseDateFrVersIso,
  prepareChamps,
  resoudreValeurTexte,
  serializeChamps,
  type Champ,
} from './champs'

// Fabrique un champ valide (au sens de champSchema) qu'on personnalise ensuite.
function champ(partiel: Partial<Champ> = {}): Champ {
  return {
    cle: 'Marque',
    type: 'texte',
    requis: false,
    defaut: null,
    ...partiel,
  }
}

describe('CHAMP_TYPES', () => {
  it('expose les 5 types attendus avec leur libellé', () => {
    expect(CHAMP_TYPES.map((t) => t.value)).toEqual([
      'texte',
      'nombre',
      'date',
      'oui-non',
      'liste',
    ])
    expect(CHAMP_TYPES.find((t) => t.value === 'oui-non')?.label).toBe(
      'Oui / Non',
    )
  })
})

describe('champSchema', () => {
  it('valide un champ complet', () => {
    const res = champSchema.safeParse({
      cle: 'Puissance',
      type: 'nombre',
      unite: 'kW',
      requis: true,
      defaut: 5,
    })
    expect(res.success).toBe(true)
  })

  it('rejette un type inconnu', () => {
    expect(
      champSchema.safeParse({
        cle: 'x',
        type: 'couleur',
        requis: false,
        defaut: null,
      }).success,
    ).toBe(false)
  })

  it('rejette une clé de plus de 60 caractères', () => {
    expect(
      champSchema.safeParse({
        cle: 'a'.repeat(61),
        type: 'texte',
        requis: false,
        defaut: null,
      }).success,
    ).toBe(false)
  })
})

describe('parseChamps', () => {
  it('renvoie [] pour null ou une valeur non-objet', () => {
    expect(parseChamps(null)).toEqual([])
    expect(parseChamps(undefined)).toEqual([])
    expect(parseChamps('texte')).toEqual([])
    expect(parseChamps(42)).toEqual([])
  })

  it('lit le format { champs: [...] } et ne garde que les champs valides', () => {
    const specs = {
      champs: [
        { cle: 'Marque', type: 'texte', requis: false, defaut: null },
        { cle: 'invalide', type: 'couleur', requis: false, defaut: null }, // rejeté
        {
          cle: 'Puissance',
          type: 'nombre',
          unite: 'kW',
          requis: true,
          defaut: 5,
        },
      ],
    }
    const champs = parseChamps(specs)
    expect(champs).toHaveLength(2)
    expect(champs.map((c) => c.cle)).toEqual(['Marque', 'Puissance'])
  })

  it('renvoie [] si champs contient uniquement des entrées invalides', () => {
    expect(parseChamps({ champs: [{ nawak: true }, 3, 'x'] })).toEqual([])
  })

  it('convertit le format plat legacy { cle: valeur } en champs texte', () => {
    const champs = parseChamps({
      marque: 'Bosch',
      puissance: 5,
      actif: true,
      extra: null,
    })
    expect(champs).toEqual([
      {
        cle: 'marque',
        type: 'texte',
        requis: false,
        defaut: null,
        valeur: 'Bosch',
      },
      {
        cle: 'puissance',
        type: 'texte',
        requis: false,
        defaut: null,
        valeur: '5',
      },
      {
        cle: 'actif',
        type: 'texte',
        requis: false,
        defaut: null,
        valeur: 'true',
      },
      {
        cle: 'extra',
        type: 'texte',
        requis: false,
        defaut: null,
        valeur: null,
      },
    ])
  })
})

describe('serializeChamps', () => {
  it('emballe la liste sous la clé { champs }', () => {
    const liste = [champ()]
    expect(serializeChamps(liste)).toEqual({ champs: liste })
  })
})

describe('round-trip parseChamps ↔ serializeChamps', () => {
  it('préserve une liste de champs valides', () => {
    const liste: Champ[] = [
      champ({ cle: 'Marque', type: 'texte', defaut: 'Bosch' }),
      champ({
        cle: 'Puissance',
        type: 'nombre',
        unite: 'kW',
        requis: true,
        defaut: 5,
      }),
      champ({ cle: 'Actif', type: 'oui-non', requis: false, defaut: true }),
      champ({
        cle: 'Classe',
        type: 'liste',
        options: ['A', 'B', 'C'],
        requis: true,
        defaut: 'A',
      }),
    ]
    expect(parseChamps(serializeChamps(liste))).toEqual(liste)
  })
})

describe('prepareChamps — nettoyage', () => {
  it('trim les noms et retire les listes/unités hors-contexte', () => {
    const res = prepareChamps([
      champ({ cle: '  Marque  ', type: 'texte', unite: 'kW', options: ['x'] }),
    ])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.champs[0]?.cle).toBe('Marque')
      expect(res.champs[0]?.unite).toBeUndefined() // unité ignorée hors « nombre »
      expect(res.champs[0]?.options).toBeUndefined() // options ignorées hors « liste »
    }
  })

  it('force requis=false pour un champ oui-non', () => {
    const res = prepareChamps([champ({ type: 'oui-non', requis: true })])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.champs[0]?.requis).toBe(false)
  })

  it('conserve et trim l’unité pour un nombre, l’efface si vide', () => {
    const res = prepareChamps([
      champ({ cle: 'P', type: 'nombre', unite: '  bars ' }),
      champ({ cle: 'Q', type: 'nombre', unite: '   ' }),
    ])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.champs[0]?.unite).toBe('bars')
      expect(res.champs[1]?.unite).toBeUndefined()
    }
  })

  it('trim, retire les options vides et déduplique une liste', () => {
    const res = prepareChamps([
      champ({
        cle: 'Classe',
        type: 'liste',
        options: [' A ', 'B', '', '  ', 'A', 'b '],
      }),
    ])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.champs[0]?.options).toEqual(['A', 'B', 'b'])
  })
})

describe('prepareChamps — validations', () => {
  it('refuse un nom vide (après trim)', () => {
    const res = prepareChamps([champ({ cle: '   ' })])
    expect(res).toEqual({ ok: false, error: 'Chaque champ doit avoir un nom.' })
  })

  it('refuse des noms en doublon (insensible à la casse)', () => {
    const res = prepareChamps([
      champ({ cle: 'Marque' }),
      champ({ cle: 'marque' }),
    ])
    expect(res).toEqual({
      ok: false,
      error: 'Les noms de champ doivent être uniques.',
    })
  })

  it('refuse un nom de plus de 60 caractères', () => {
    const long = 'N'.repeat(61)
    const res = prepareChamps([champ({ cle: long })])
    expect(res.ok).toBe(false)
    if (!res.ok)
      expect(res.error).toBe(`Le nom « ${long} » dépasse 60 caractères.`)
  })

  it('refuse une unité de plus de 20 caractères', () => {
    const unite = 'u'.repeat(21)
    const res = prepareChamps([champ({ cle: 'P', type: 'nombre', unite })])
    expect(res.ok).toBe(false)
    if (!res.ok)
      expect(res.error).toBe('L’unité du champ « P » dépasse 20 caractères.')
  })

  it('refuse une liste sans aucune option (après nettoyage)', () => {
    const res = prepareChamps([
      champ({ cle: 'Classe', type: 'liste', options: ['', '   '] }),
    ])
    expect(res.ok).toBe(false)
    if (!res.ok)
      expect(res.error).toBe(
        'Le champ « Classe » (liste) doit avoir au moins une option.',
      )
  })

  it('refuse une charge utile trop volumineuse (> 9500 caractères)', () => {
    const options = Array.from(
      { length: 400 },
      (_, i) => `option-${String(i)}-${'x'.repeat(20)}`,
    )
    const res = prepareChamps([
      champ({ cle: 'Grande', type: 'liste', options }),
    ])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Trop de caractéristiques/)
  })

  it('accepte une liste de champs propre et renvoie les champs nettoyés', () => {
    const res = prepareChamps([
      champ({ cle: ' Marque ', type: 'texte' }),
      champ({ cle: 'Classe', type: 'liste', options: ['A', 'B'] }),
    ])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.champs).toHaveLength(2)
      expect(res.champs[0]?.cle).toBe('Marque')
    }
  })
})

describe('formatChampValeur', () => {
  it('renvoie « — » pour null ou chaîne vide', () => {
    expect(formatChampValeur(champ({ type: 'texte' }), null)).toBe('—')
    expect(formatChampValeur(champ({ type: 'texte' }), '')).toBe('—')
  })

  it('formate un oui-non', () => {
    const c = champ({ type: 'oui-non' })
    expect(formatChampValeur(c, true)).toBe('Oui')
    expect(formatChampValeur(c, false)).toBe('Non')
  })

  it('formate un texte tel quel', () => {
    expect(formatChampValeur(champ({ type: 'texte' }), 'Bosch')).toBe('Bosch')
  })

  it('formate un nombre, avec ou sans unité', () => {
    expect(formatChampValeur(champ({ type: 'nombre' }), 5)).toBe('5')
    expect(formatChampValeur(champ({ type: 'nombre', unite: 'kW' }), 5)).toBe(
      '5 kW',
    )
    expect(formatChampValeur(champ({ type: 'nombre' }), 0)).toBe('0')
  })

  it('formate une date via formatDate (JJ/MM/AAAA)', () => {
    expect(
      formatChampValeur(champ({ type: 'date' }), '2026-06-07T10:00:00'),
    ).toBe('07/06/2026')
  })

  it('rend « Oui »/« Non » pour un booléen sur un type non oui-non', () => {
    expect(formatChampValeur(champ({ type: 'texte' }), true)).toBe('Oui')
    expect(formatChampValeur(champ({ type: 'texte' }), false)).toBe('Non')
  })

  it('rend une valeur numérique sur un type liste', () => {
    expect(formatChampValeur(champ({ type: 'liste', options: ['1'] }), 1)).toBe(
      '1',
    )
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Tests de PROPRIÉTÉS (fast-check) sur les deux fonctions qui lisent du texte
// NON FIABLE (cellules de CSV collées par l'utilisateur ou produites par une
// IA) : `parseDateFrVersIso` et `resoudreValeurTexte`. Elles sont partagées
// par 6 modules d'import : un défaut ici se propage partout.
// Graine fixe : tout contre-exemple trouvé est rejouable.
// ───────────────────────────────────────────────────────────────────────────

const RUNS = { numRuns: 1000, seed: 42 } as const

/** Textes hostiles : chiffres, séparateurs, blancs, accents, casse, symboles. */
const texteHostile = fc.oneof(
  fc.string(),
  fc.string({
    unit: fc.constantFrom(
      '0',
      '1',
      '9',
      ',',
      '.',
      '/',
      '-',
      '+',
      'e',
      'x',
      'O',
      'u',
      'i',
      'n',
      'N',
      ' ',
      '\t',
      'é',
      'A',
      'B',
      ' ',
      '😀',
    ),
    maxLength: 12,
  }),
)

describe('parseDateFrVersIso — oracle calendaire indépendant', () => {
  // ORACLE : calendrier grégorien recalculé ICI, sans `Date` ni recopie de la
  // sortie observée. Bissextile = divisible par 4, SAUF par 100, SAUF par 400.
  const estBissextile = (a: number) =>
    (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
  const joursDansLeMois = (mois: number, annee: number) =>
    [
      31,
      estBissextile(annee) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ][mois - 1] ?? 0
  const pad2 = (n: number) => n.toString().padStart(2, '0')

  it('accepte une date SI ET SEULEMENT SI elle existe au calendrier', () => {
    // Couvre par construction les débordements 31/04, 31/06, 31/09, 31/11 et
    // 29/02 — les off-by-one classiques d'un contrôle de date fait à la main.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1900, max: 2100 }),
        (jj, mm, aaaa) => {
          const existe = jj <= joursDansLeMois(mm, aaaa)
          const an = String(aaaa)
          const attendu = existe ? `${an}-${pad2(mm)}-${pad2(jj)}` : null
          expect(parseDateFrVersIso(`${pad2(jj)}/${pad2(mm)}/${an}`)).toBe(
            attendu,
          )
          // Même verdict sans les zéros de tête (le format toléré par la regex).
          expect(parseDateFrVersIso(`${String(jj)}/${String(mm)}/${an}`)).toBe(
            attendu,
          )
        },
      ),
      { numRuns: 3000, seed: 42 },
    )
  })

  it('tranche le 29 février pour CHAQUE année de 1900 à 2100', () => {
    // ORACLE : 1900 et 2100 (÷100 mais pas ÷400) ne sont PAS bissextiles,
    // 2000 (÷400) l'est. Exhaustif : aucune année n'échappe au contrôle.
    for (let annee = 1900; annee <= 2100; annee++) {
      const an = String(annee)
      const attendu = estBissextile(annee) ? `${an}-02-29` : null
      expect(parseDateFrVersIso(`29/02/${an}`)).toBe(attendu)
    }
    expect(parseDateFrVersIso('29/02/1900')).toBeNull()
    expect(parseDateFrVersIso('29/02/2000')).toBe('2000-02-29')
    expect(parseDateFrVersIso('29/02/2100')).toBeNull()
  })

  it('n’accepte que le format JJ/MM/AAAA (jour/mois/année hors bornes refusés)', () => {
    // ORACLE : hors de 1..31 / 1..12, aucune date n'existe — quel que soit
    // ce que `Date` accepterait de recaler en silence (32/01 → 01/02…).
    fc.assert(
      fc.property(
        fc.integer({ min: 32, max: 99 }),
        fc.integer({ min: 13, max: 99 }),
        fc.integer({ min: 1900, max: 2100 }),
        (jjHors, mmHors, aaaa) => {
          const an = String(aaaa)
          expect(parseDateFrVersIso(`${String(jjHors)}/01/${an}`)).toBeNull()
          expect(parseDateFrVersIso(`01/${String(mmHors)}/${an}`)).toBeNull()
          expect(parseDateFrVersIso(`00/01/${an}`)).toBeNull()
          expect(parseDateFrVersIso(`01/00/${an}`)).toBeNull()
        },
      ),
      RUNS,
    )
  })

  it('refuse tout ce qui n’est pas exactement trois nombres séparés par « / »', () => {
    // ORACLE : le format est imposé à l'utilisateur (JJ/MM/AAAA) ; une date
    // ISO, une année sur 2 chiffres ou un texte parasite doivent être REFUSÉS
    // plutôt que devinés — deviner, c'est enregistrer une fausse date.
    for (const mauvais of [
      '2026-06-07',
      '07/06/26',
      '07-06-2026',
      '07/06/2026 10:00',
      'aujourd’hui',
      '07//2026',
      '007/06/2026',
      '07/06/20261',
      '',
    ]) {
      expect(parseDateFrVersIso(mauvais)).toBeNull()
    }
    // Les blancs de bordure, eux, sont tolérés (trim explicite).
    expect(parseDateFrVersIso('  07/06/2026  ')).toBe('2026-06-07')
  })

  it('ne jette jamais et rend toujours null ou une date ISO bien formée', () => {
    // ORACLE : fonction TOTALE sur du texte non fiable, et contrat de sortie
    // strict (`YYYY-MM-DD`) — c'est cette chaîne qui part en base.
    fc.assert(
      fc.property(texteHostile, (texte) => {
        const res = parseDateFrVersIso(texte)
        expect(res === null || /^\d{4}-\d{2}-\d{2}$/.test(res)).toBe(true)
      }),
      RUNS,
    )
  })

  it('aller-retour : la date ISO rendue redésigne le même jour', () => {
    // ORACLE : la conversion ne doit pas décaler d'un jour (piège classique
    // du fuseau : `new Date('2026-06-07')` est en UTC, pas en heure locale).
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1900, max: 2100 }),
        (jj, mm, aaaa) => {
          const iso = parseDateFrVersIso(
            `${pad2(jj)}/${pad2(mm)}/${String(aaaa)}`,
          )
          expect(iso).not.toBeNull()
          const [a, m, j] = (iso ?? '').split('-')
          expect([Number(j), Number(m), Number(a)]).toEqual([jj, mm, aaaa])
        },
      ),
      RUNS,
    )
  })
})

describe('resoudreValeurTexte — totalité et invariants', () => {
  /** Champ arbitraire mais TOUJOURS valide au sens de `champSchema`. */
  const champArb: fc.Arbitrary<Champ> = fc.record({
    cle: fc.constantFrom('Marque', 'Puissance', 'Mise en service', 'Classe'),
    type: fc.constantFrom('texte', 'nombre', 'date', 'oui-non', 'liste'),
    requis: fc.boolean(),
    defaut: fc.constantFrom(null, '', 'A', 0, 5, true, false),
    options: fc.constant(['A', 'B', 'Classe C', 'Réglé']),
  })

  it('ne jette jamais, pour tout champ et tout texte', () => {
    // ORACLE : la cellule vient d'un CSV collé (ou d'une IA générative) ; la
    // conversion doit être TOTALE et rendre une erreur en clair, pas jeter.
    fc.assert(
      fc.property(
        champArb,
        fc.option(texteHostile, { nil: undefined }),
        (c, brut) => {
          const res = resoudreValeurTexte(c, brut)
          expect(typeof res.ok).toBe('boolean')
          if (!res.ok) expect(res.erreur.length).toBeGreaterThan(0)
        },
      ),
      RUNS,
    )
  })

  it('cellule vide : valeur par défaut, ou erreur si le champ est obligatoire', () => {
    // ORACLE : règle métier documentée — « Vide → valeur par défaut du champ,
    // sauf si requis ». Une cellule faite de blancs EST une cellule vide.
    fc.assert(
      fc.property(
        champArb,
        fc.constantFrom('', ' ', '\t', '   \n ', ' ', undefined),
        (c, blanc) => {
          const res = resoudreValeurTexte(c, blanc)
          if (c.requis) {
            expect(res.ok).toBe(false)
            if (!res.ok) expect(res.erreur).toContain(c.cle)
          } else {
            expect(res).toEqual({ ok: true, valeur: c.defaut })
          }
        },
      ),
      RUNS,
    )
  })

  it('les blancs de bordure n’ont aucune influence', () => {
    // ORACLE : un CSV produit par Excel ou une IA aligne volontiers les
    // colonnes ; « 12,5 » et «  12,5  » désignent la même valeur.
    fc.assert(
      fc.property(
        champArb,
        texteHostile,
        fc.constantFrom(' ', '  ', '\t', ' \t '),
        (c, s, blanc) => {
          expect(resoudreValeurTexte(c, `${blanc}${s}${blanc}`)).toEqual(
            resoudreValeurTexte(c, s),
          )
        },
      ),
      RUNS,
    )
  })

  it('la valeur rendue respecte toujours le type du champ (hors défaut)', () => {
    // ORACLE : le résultat part dans le JSONB `specifications` ; un nombre doit
    // être un `number` FINI, un oui-non un `boolean`, une date une chaîne ISO,
    // une valeur de liste l'UNE des options. (Cellule non vide : sinon c'est
    // le défaut du gabarit qui est rendu, sans revalidation — cf. plus bas.)
    fc.assert(
      fc.property(champArb, texteHostile, (c, s) => {
        if (s.trim() === '') return
        const res = resoudreValeurTexte(c, s)
        if (!res.ok) return
        if (c.type === 'nombre') {
          expect(typeof res.valeur).toBe('number')
          expect(Number.isFinite(res.valeur as number)).toBe(true)
        }
        if (c.type === 'oui-non') expect(typeof res.valeur).toBe('boolean')
        if (c.type === 'date')
          expect(/^\d{4}-\d{2}-\d{2}$/.test(String(res.valeur))).toBe(true)
        if (c.type === 'liste')
          expect(c.options ?? []).toContain(res.valeur as string)
        if (c.type === 'texte') expect(res.valeur).toBe(s.trim())
      }),
      RUNS,
    )
  })

  it('la valeur par défaut du gabarit n’est PAS revalidée (caractérisation)', () => {
    // ORACLE : par contrat, `defaut` vient du gabarit (déjà validé à la
    // création du modèle) et n'est pas retypé. Écrit noir sur blanc : si un
    // gabarit portait un défaut incohérent, il passerait tel quel.
    const c: Champ = {
      cle: 'Mise en service',
      type: 'date',
      requis: false,
      defaut: 'pas-une-date',
    }
    expect(resoudreValeurTexte(c, '')).toEqual({
      ok: true,
      valeur: 'pas-une-date',
    })
  })
})

describe('resoudreValeurTexte — insensibilité à la casse', () => {
  /** Toutes les variantes de casse d'un mot (générateur, pas liste figée). */
  const enCasseAleatoire = (mot: string) =>
    fc
      .array(fc.boolean(), { minLength: mot.length, maxLength: mot.length })
      .map((majuscules) =>
        Array.from(mot, (lettre, i) =>
          majuscules[i] ? lettre.toUpperCase() : lettre.toLowerCase(),
        ).join(''),
      )

  it('oui-non : toute casse de « oui » / « non » est reconnue', () => {
    // ORACLE : règle métier — « Oui » / « Non », insensible à la casse. Une IA
    // écrit « OUI », un tableur « oui » : les deux valent le même booléen.
    const c = champ({ cle: 'Sous garantie', type: 'oui-non' })
    fc.assert(
      fc.property(enCasseAleatoire('oui'), (mot) => {
        expect(resoudreValeurTexte(c, mot)).toEqual({ ok: true, valeur: true })
      }),
      { numRuns: 200, seed: 42 },
    )
    fc.assert(
      fc.property(enCasseAleatoire('non'), (mot) => {
        expect(resoudreValeurTexte(c, mot)).toEqual({ ok: true, valeur: false })
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('oui-non : tout autre mot est refusé, sans valeur par défaut de repli', () => {
    // ORACLE : un booléen ne se devine pas. « Peut-être », « 1 », « true »
    // doivent lever une erreur plutôt que d'être interprétés.
    const c = champ({ cle: 'Sous garantie', type: 'oui-non' })
    fc.assert(
      fc.property(texteHostile, (s) => {
        const v = s.trim().toLowerCase()
        if (v === '' || v === 'oui' || v === 'non') return
        expect(resoudreValeurTexte(c, s).ok).toBe(false)
      }),
      RUNS,
    )
  })

  it('liste : toute casse d’une option est reconnue et rend l’option CANONIQUE', () => {
    // ORACLE : la valeur stockée doit être celle du gabarit (afin que le
    // filtrage et l'affichage restent cohérents), jamais la casse tapée.
    const options = ['Classe A', 'Réglé', 'b']
    const c = champ({ cle: 'Classe', type: 'liste', options })
    fc.assert(
      fc.property(
        fc.constantFrom(...options).chain((o) => enCasseAleatoire(o)),
        (saisi) => {
          const res = resoudreValeurTexte(c, saisi)
          expect(res.ok).toBe(true)
          if (res.ok) expect(options).toContain(res.valeur as string)
        },
      ),
      { numRuns: 300, seed: 42 },
    )
  })

  it('liste : une valeur hors options est refusée et l’erreur les énumère', () => {
    // ORACLE : refuser en expliquant — l'utilisateur doit pouvoir corriger son
    // CSV sans deviner les valeurs autorisées.
    const c = champ({ cle: 'Classe', type: 'liste', options: ['A', 'B'] })
    const res = resoudreValeurTexte(c, 'C')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.erreur).toContain('A, B')
  })
})

describe('resoudreValeurTexte — nombres « à la française »', () => {
  const nombre = champ({ cle: 'Puissance', type: 'nombre', unite: 'kW' })
  const resoudre = (s: string) => resoudreValeurTexte(nombre, s)

  it('lit un décimal à virgule (et son équivalent à point)', () => {
    // ORACLE : règle métier — virgule décimale. Pour tout couple
    // (entier, décimales), « e,d » vaut le même nombre que « e.d ».
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 0, max: 999 }),
        (entier, decimales) => {
          const e = String(entier)
          const d = String(decimales)
          const attendu = Number(`${e}.${d}`)
          expect(resoudre(`${e},${d}`)).toEqual({ ok: true, valeur: attendu })
          expect(resoudre(`${e}.${d}`)).toEqual({ ok: true, valeur: attendu })
        },
      ),
      RUNS,
    )
  })

  it('refuse toute écriture à plusieurs virgules (le remplacement ne porte que sur la 1re)', () => {
    // ORACLE : `replace(',', '.')` ne remplace QUE la première occurrence. La
    // propriété qui compte n'est pas « combien de virgules sont remplacées »
    // mais « aucune valeur à ≥ 2 virgules n'est acceptée » : sinon « 1,234,5 »
    // (séparateur de milliers anglo-saxon) serait TRONQUÉ en silence.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9999 }), {
          minLength: 3,
          maxLength: 5,
        }),
        (morceaux) => {
          expect(resoudre(morceaux.join(',')).ok).toBe(false)
        },
      ),
      RUNS,
    )
    expect(resoudre('1,234,5').ok).toBe(false)
    expect(resoudre('1 234,5').ok).toBe(false) // espace de milliers : refusé
  })

  it('refuse les non-nombres et les valeurs non finies', () => {
    // ORACLE : un seuil, une puissance, une surface sont des nombres FINIS.
    // « Infinity » est un mot du langage JavaScript, pas une saisie légitime.
    for (const mauvais of [
      'NaN',
      'Infinity',
      '-Infinity',
      '+Infinity',
      'infinity',
      '1e400', // déborde vers Infinity
      'douze',
      '12 kW',
      '12%',
      '1,',
      '--5',
      '1/2',
    ]) {
      const res = resoudre(mauvais)
      if (res.ok) {
        // Si c'est accepté, au moins que ce soit fini (invariant minimal).
        expect(Number.isFinite(res.valeur as number)).toBe(true)
      }
      if (['NaN', 'Infinity', '-Infinity', '1e400'].includes(mauvais)) {
        expect(res.ok).toBe(false)
      }
    }
  })

  it('accepte quelques écritures « JavaScript » (caractérisation des tolérances)', () => {
    // ORACLE : ces formes sont des tolérances d'écriture (reprises telles
    // quelles par le filtre de forme qui précède la conversion), pas une règle
    // métier. On les fige pour que toute évolution du parseur soit VISIBLE.
    expect(resoudre('+5')).toEqual({ ok: true, valeur: 5 }) // signe + explicite
    expect(resoudre('5.')).toEqual({ ok: true, valeur: 5 }) // point final
    expect(resoudre('1,')).toEqual({ ok: true, valeur: 1 }) // virgule finale
    expect(resoudre('.5')).toEqual({ ok: true, valeur: 0.5 })
    expect(resoudre(',5')).toEqual({ ok: true, valeur: 0.5 })
    expect(resoudre('1e3')).toEqual({ ok: true, valeur: 1000 }) // notation scientifique
  })

  // RÉGRESSION : un champ « nombre » d'un CSV français n'accepte qu'un décimal
  // (signe optionnel, chiffres, virgule ou point). `Number()` reconnaît aussi
  // les littéraux JavaScript non décimaux et les convertissait en silence :
  //   « 0x10 » → 16 · « 0b101 » → 5 · « 0o17 » → 15
  // Une référence d'équipement comme « 0x10 » saisie dans une colonne
  // numérique devenait donc la valeur 16, sans le moindre avertissement.
  it('refuse les littéraux non décimaux (hexadécimal, binaire, octal)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 255 }),
        fc.constantFrom('0x', '0b', '0o'),
        (n, prefixe) => {
          const base = prefixe === '0x' ? 16 : prefixe === '0b' ? 2 : 8
          expect(resoudre(`${prefixe}${n.toString(base)}`).ok).toBe(false)
        },
      ),
      { numRuns: 200, seed: 42 },
    )
  })
})
