import { describe, expect, it } from 'vitest'
import {
  CHAMP_TYPES,
  champSchema,
  formatChampValeur,
  parseChamps,
  prepareChamps,
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
      champSchema.safeParse({ cle: 'x', type: 'couleur', requis: false, defaut: null })
        .success,
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
        { cle: 'Puissance', type: 'nombre', unite: 'kW', requis: true, defaut: 5 },
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
      { cle: 'marque', type: 'texte', requis: false, defaut: null, valeur: 'Bosch' },
      { cle: 'puissance', type: 'texte', requis: false, defaut: null, valeur: '5' },
      { cle: 'actif', type: 'texte', requis: false, defaut: null, valeur: 'true' },
      { cle: 'extra', type: 'texte', requis: false, defaut: null, valeur: null },
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
      champ({ cle: 'Puissance', type: 'nombre', unite: 'kW', requis: true, defaut: 5 }),
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
    if (!res.ok) expect(res.error).toBe(`Le nom « ${long} » dépasse 60 caractères.`)
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
