import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  COL_OPERATION,
  COL_OP_DESCRIPTION,
  COL_ORDRE,
  COL_SEUIL_MAX,
  COL_SEUIL_MIN,
  COL_TYPE,
  COL_UNITE,
  blocColonnesOperation,
  libelleUnite,
  parseNombreFr,
  parseOuiNon,
  resoudreOperation,
  resumeOperation,
  texteValeur,
  type OperationCsvResolue,
  type OperationCsvValues,
  type OperationRefs,
} from './csv-import'

const refs: OperationRefs = {
  types: [
    { id: 1, libelle: 'Vérification', necessite_seuils: false },
    { id: 4, libelle: 'Mesure', necessite_seuils: true },
  ],
  unites: [
    { id: 1, nom: 'Degrés Celsius', symbole: '°C', necessite_seuils: true },
    { id: 7, nom: 'Heure', symbole: 'h', necessite_seuils: false },
  ],
}

/** Petit lecteur de cellules par nom de colonne, comme le fait un parseur réel. */
const lecteur = (cellules: Record<string, string>) => (colonne: string) =>
  cellules[colonne] ?? ''

describe('resoudreOperation', () => {
  it('résout une opération simple sans unité ni seuils', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Contrôler le serrage',
        [COL_ORDRE]: '2',
        [COL_TYPE]: 'Vérification',
      }),
      refs,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation.values).toMatchObject({
      nom: 'Contrôler le serrage',
      ordre: '2',
      type_operation_id: '1',
      unite_id: '',
    })
    expect(r.operation.aUnite).toBe(false)
    expect(r.operation.requiresSeuils).toBe(false)
  })

  it('résout une mesure avec unité et seuils à la française', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever la température',
        [COL_TYPE]: 'Mesure',
        [COL_UNITE]: 'Degrés Celsius (°C)',
        [COL_SEUIL_MIN]: '18,5',
        [COL_SEUIL_MAX]: '24',
      }),
      refs,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation.values).toMatchObject({
      unite_id: '1',
      seuil_minimum: '18.5',
      seuil_maximum: '24',
    })
    expect(r.operation.requiresSeuils).toBe(true)
  })

  it('accepte l’unité écrite par son seul symbole', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever',
        [COL_TYPE]: 'Mesure',
        [COL_UNITE]: '°C',
      }),
      refs,
    )
    expect(r.ok && r.operation.values.unite_id).toBe('1')
  })

  it('exige une unité pour une mesure et refuse un type inconnu', () => {
    const sansUnite = resoudreOperation(
      lecteur({ [COL_OPERATION]: 'Relever', [COL_TYPE]: 'Mesure' }),
      refs,
    )
    expect(sansUnite.ok).toBe(false)
    if (!sansUnite.ok)
      expect(sansUnite.erreurs.join(' ')).toContain('Unité est obligatoire')

    const typeInconnu = resoudreOperation(
      lecteur({ [COL_OPERATION]: 'Relever', [COL_TYPE]: 'Bricolage' }),
      refs,
    )
    expect(typeInconnu.ok).toBe(false)
    if (!typeInconnu.ok)
      expect(typeInconnu.erreurs.join(' ')).toContain('Bricolage')
  })

  it('ignore unité et seuils hors mesure, comme le formulaire', () => {
    const r = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Nettoyer',
        [COL_TYPE]: 'Vérification',
        [COL_UNITE]: 'Heure (h)',
        [COL_SEUIL_MIN]: '3',
      }),
      refs,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation.values.unite_id).toBe('')
    expect(r.operation.values.seuil_minimum).toBe('')
  })

  it('refuse un minimum supérieur au maximum et un ordre non entier', () => {
    const seuils = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever',
        [COL_TYPE]: 'Mesure',
        [COL_UNITE]: '°C',
        [COL_SEUIL_MIN]: '30',
        [COL_SEUIL_MAX]: '10',
      }),
      refs,
    )
    expect(seuils.ok).toBe(false)

    const ordre = resoudreOperation(
      lecteur({
        [COL_OPERATION]: 'Relever',
        [COL_ORDRE]: 'premier',
        [COL_TYPE]: 'Vérification',
      }),
      refs,
    )
    expect(ordre.ok).toBe(false)
  })
})

describe('blocColonnesOperation', () => {
  it('énumère les valeurs exactes des référentiels', () => {
    const bloc = blocColonnesOperation(refs).join('\n')
    expect(bloc).toContain('« Vérification »')
    expect(bloc).toContain('« Degrés Celsius (°C) »')
    // Les unités sans bornes ne sont pas proposées comme porteuses de seuils.
    expect(bloc).toMatch(/bornes \(Degrés Celsius \(°C\)\)/)
  })
})

describe('lecture des valeurs françaises', () => {
  it('lit les nombres à virgule et les Oui/Non tolérants', () => {
    expect(parseNombreFr('6,5')).toBe(6.5)
    expect(parseNombreFr('6.5')).toBe(6.5)
    expect(parseNombreFr('abc')).toBeNull()
    expect(parseOuiNon('OUI')).toBe(true)
    expect(parseOuiNon('n')).toBe(false)
    expect(parseOuiNon('peut-être')).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Durcissement Martin : les cas limites et la gestion d'erreur, c'est-à-dire
// tout ce qui protège l'utilisateur d'un import silencieusement faux.
// ───────────────────────────────────────────────────────────────────────────

/** Référentiel volontairement RICHE : plusieurs types à seuils, plusieurs unités
 *  à bornes, et une unité SANS symbole — le seul moyen de distinguer « trouve la
 *  bonne unité » de « trouve la première unité ». */
const refsRiches: OperationRefs = {
  types: [
    { id: 1, libelle: 'Vérification', necessite_seuils: false },
    { id: 4, libelle: 'Mesure', necessite_seuils: true },
    { id: 5, libelle: 'Relevé de compteur', necessite_seuils: true },
  ],
  unites: [
    { id: 1, nom: 'Degrés Celsius', symbole: '°C', necessite_seuils: true },
    { id: 2, nom: 'Pourcentage', symbole: '%', necessite_seuils: true },
    { id: 7, nom: 'Heure', symbole: 'h', necessite_seuils: false },
    { id: 9, nom: 'Passage', symbole: null, necessite_seuils: false },
  ],
}

const op = (cellules: Record<string, string>, r: OperationRefs = refs) =>
  resoudreOperation(lecteur(cellules), r)

/** Les erreurs d'une ligne refusée (échoue si la ligne a été acceptée). */
const erreursDe = (
  r: ReturnType<typeof resoudreOperation>,
  contexte: string,
): string[] => {
  expect(r.ok, `${contexte} aurait dû être refusée`).toBe(false)
  return r.ok ? [] : r.erreurs
}

describe('resoudreOperation — chaque erreur NOMME sa colonne', () => {
  it('réclame le libellé de l’opération, et lui seul', () => {
    // Oracle : le libellé manquant est UNE erreur, portant le nom de la colonne
    // « Opération » — l'utilisateur doit savoir quelle cellule remplir.
    expect(
      erreursDe(op({ [COL_TYPE]: 'Vérification' }), 'libellé vide'),
    ).toEqual([`${COL_OPERATION} est obligatoire.`])
  })

  it('traite une cellule blanche comme une cellule vide', () => {
    // Oracle : un collage depuis un tableur amène des espaces ; « obligatoire »
    // doit se dire de la même façon pour « » et pour «    ».
    for (const blanc of ['', '   ', '\t ']) {
      expect(
        erreursDe(
          op({ [COL_OPERATION]: 'Relever', [COL_TYPE]: blanc }),
          `type « ${blanc} »`,
        ),
      ).toEqual([`${COL_TYPE} est obligatoire.`])
    }
  })

  it('énumère les types possibles quand le type est inconnu, sans réclamer d’unité', () => {
    // Oracle : un type inconnu produit UNE seule erreur, qui cite la valeur
    // fautive et la liste exacte des valeurs admises. Un type inconnu n'est pas
    // une mesure : on ne réclame pas d'unité par-dessus.
    expect(
      erreursDe(
        op({ [COL_OPERATION]: 'Relever', [COL_TYPE]: 'Bricolage' }),
        'type inconnu',
      ),
    ).toEqual([
      `${COL_TYPE} « Bricolage » inconnu (valeurs possibles : Vérification, Mesure).`,
    ])
  })

  it('cite le type dans le message d’unité manquante', () => {
    // Oracle : « l'unité est obligatoire » n'est compréhensible que si le
    // message dit POUR QUEL TYPE elle l'est. Une cellule blanche est une
    // cellule vide : elle réclame l'unité, elle n'en invente pas une inconnue.
    for (const brut of ['', '   ']) {
      expect(
        erreursDe(
          op({
            [COL_OPERATION]: 'Relever',
            [COL_TYPE]: 'Mesure',
            [COL_UNITE]: brut,
          }),
          `mesure avec unité « ${brut} »`,
        ),
      ).toEqual([
        `${COL_UNITE} est obligatoire pour une opération de type « Mesure ».`,
      ])
    }
  })

  it('énumère les unités possibles quand l’unité est inconnue', () => {
    // Oracle : même contrat que pour le type — valeur fautive + liste exacte.
    // Le référentiel contient ici une unité SANS symbole : la comparaison ne
    // doit ni la confondre avec une autre, ni exploser dessus.
    expect(
      erreursDe(
        op(
          {
            [COL_OPERATION]: 'Relever',
            [COL_TYPE]: 'Mesure',
            [COL_UNITE]: 'Bananes',
          },
          refsRiches,
        ),
        'unité inconnue',
      ),
    ).toEqual([
      `${COL_UNITE} « Bananes » inconnue (valeurs possibles : Degrés Celsius (°C), Pourcentage (%), Heure (h), Passage).`,
    ])
  })
})

describe('resoudreOperation — l’ordre est un entier positif ENTIER', () => {
  it('refuse tout ce qui n’est pas intégralement des chiffres, en citant la valeur', () => {
    // Oracle : /^\d+$/ — ni préfixe, ni suffixe, ni signe, ni décimale. Le
    // message cite la colonne ET la valeur refusée.
    for (const brut of ['premier', '1a', 'a1', '-1', '1,5', '1 2', '1.0']) {
      expect(
        erreursDe(
          op({
            [COL_OPERATION]: 'Relever',
            [COL_TYPE]: 'Vérification',
            [COL_ORDRE]: brut,
          }),
          `ordre « ${brut} »`,
        ),
      ).toEqual([`${COL_ORDRE} : « ${brut} » n'est pas un entier positif.`])
    }
  })

  it('accepte un ordre à plusieurs chiffres, espaces compris', () => {
    // Oracle : « 12 » est un ordre valide (pas seulement « 1 »), et les espaces
    // du collage sont rognés avant contrôle comme avant stockage.
    const r = op({
      [COL_OPERATION]: 'Relever',
      [COL_TYPE]: 'Vérification',
      [COL_ORDRE]: ' 12 ',
    })
    expect(r.ok && r.operation.values.ordre).toBe('12')
  })

  it('accepte tout entier naturel écrit en chiffres (propriété)', () => {
    // Oracle : la règle est « un entier positif », pas « un chiffre ».
    fc.assert(
      fc.property(fc.nat({ max: 999_999 }), (n) => {
        const r = op({
          [COL_OPERATION]: 'Relever',
          [COL_TYPE]: 'Vérification',
          [COL_ORDRE]: String(n),
        })
        return r.ok && r.operation.values.ordre === String(n)
      }),
      { seed: 20260916, numRuns: 200 },
    )
  })
})

describe('resoudreOperation — résolution de l’unité', () => {
  const mesure = (unite: string) =>
    op(
      {
        [COL_OPERATION]: 'Relever',
        [COL_TYPE]: 'Mesure',
        [COL_UNITE]: unite,
      },
      refsRiches,
    )

  it('trouve LA bonne unité, pas la première, quelle que soit l’écriture', () => {
    // Oracle : trois écritures admises pour la même unité — libellé complet,
    // nom seul, symbole seul — et toutes désignent l'unité n° 2, pas la n° 1.
    for (const ecriture of ['Pourcentage (%)', 'Pourcentage', '%']) {
      const r = mesure(ecriture)
      expect(r.ok, `« ${ecriture} » aurait dû être résolue`).toBe(true)
      expect(r.ok && r.operation.values.unite_id).toBe('2')
    }
  })

  it('résout une unité dépourvue de symbole par son seul nom', () => {
    // Oracle : `libelleUnite` n'ajoute pas de parenthèses vides quand le
    // symbole est nul — l'unité reste trouvable.
    expect(
      libelleUnite({
        id: 9,
        nom: 'Passage',
        symbole: null,
        necessite_seuils: false,
      }),
    ).toBe('Passage')
    const r = mesure('passage')
    expect(r.ok).toBe(true)
    expect(r.ok && r.operation.values.unite_id).toBe('9')
  })

  it('ignore la casse et les espaces autour de l’unité et du type', () => {
    // Oracle : la comparaison passe par `norm` (trim + minuscules) des deux
    // côtés ; un collage en majuscules reste un import valide.
    const r = op(
      {
        [COL_OPERATION]: 'Relever',
        [COL_TYPE]: '  MESURE  ',
        [COL_UNITE]: '  degrés celsius (°C)  ',
      },
      refsRiches,
    )
    expect(r.ok).toBe(true)
    expect(r.ok && r.operation.values.type_operation_id).toBe('4')
    expect(r.ok && r.operation.values.unite_id).toBe('1')
  })
})

describe('resoudreOperation — les seuils ne comptent que pour une unité à bornes', () => {
  const mesureC = (cellules: Record<string, string>) =>
    op({
      [COL_OPERATION]: 'Relever',
      [COL_TYPE]: 'Mesure',
      [COL_UNITE]: '°C',
      ...cellules,
    })

  it('efface les seuils d’une mesure dont l’unité n’a pas de bornes', () => {
    // Oracle : « Heure » n'a pas de bornes ; même sur un type Mesure, ses
    // seuils sont ignorés au lieu d'être écrits en base.
    const r = op({
      [COL_OPERATION]: 'Relever le compteur horaire',
      [COL_TYPE]: 'Mesure',
      [COL_UNITE]: 'Heure (h)',
      [COL_SEUIL_MIN]: '3',
      [COL_SEUIL_MAX]: '9',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.operation.requiresSeuils).toBe(false)
    expect(r.operation.values).toMatchObject({
      unite_id: '7',
      seuil_minimum: '',
      seuil_maximum: '',
    })
  })

  it('ne reproche pas un seuil illisible quand l’unité est déjà inconnue', () => {
    // Oracle : une unité non résolue n'a pas de bornes connues ; empiler une
    // erreur de seuil par-dessus noierait la seule erreur utile.
    expect(
      erreursDe(
        op({
          [COL_OPERATION]: 'Relever',
          [COL_TYPE]: 'Mesure',
          [COL_UNITE]: 'Bananes',
          [COL_SEUIL_MIN]: 'abc',
        }),
        'unité inconnue + seuil illisible',
      ),
    ).toHaveLength(1)
  })

  it('nomme la borne illisible et cite sa valeur', () => {
    // Oracle : chaque borne refusée produit son propre message, nommant SA
    // colonne et la valeur fautive.
    expect(
      erreursDe(mesureC({ [COL_SEUIL_MIN]: 'abc' }), 'minimum illisible'),
    ).toEqual([`${COL_SEUIL_MIN} : « abc » n'est pas un nombre.`])
    expect(
      erreursDe(mesureC({ [COL_SEUIL_MAX]: 'zéro' }), 'maximum illisible'),
    ).toEqual([`${COL_SEUIL_MAX} : « zéro » n'est pas un nombre.`])
    expect(
      erreursDe(
        mesureC({ [COL_SEUIL_MIN]: 'abc', [COL_SEUIL_MAX]: 'zéro' }),
        'deux bornes illisibles',
      ),
    ).toHaveLength(2)
  })

  it('accepte un minimum ÉGAL au maximum, refuse seulement un minimum strictement supérieur', () => {
    // Oracle : la contrainte est « min ≤ max » ; l'égalité est légitime
    // (un relevé à valeur unique).
    const egal = mesureC({ [COL_SEUIL_MIN]: '10', [COL_SEUIL_MAX]: '10' })
    expect(egal.ok).toBe(true)
    expect(
      erreursDe(
        mesureC({ [COL_SEUIL_MIN]: '10,1', [COL_SEUIL_MAX]: '10' }),
        'minimum > maximum',
      ),
    ).toEqual([`${COL_SEUIL_MIN} doit être inférieur ou égal au maximum.`])
  })

  it('accepte une borne seule, sans inventer l’autre ni la comparer', () => {
    // Oracle : une borne absente reste une CHAÎNE VIDE (pas « null », pas 0) —
    // et une borne absente ne peut violer aucun ordre, même face à un négatif.
    const minSeul = mesureC({ [COL_SEUIL_MIN]: '5' })
    expect(minSeul.ok).toBe(true)
    expect(minSeul.ok && minSeul.operation.values).toMatchObject({
      seuil_minimum: '5',
      seuil_maximum: '',
    })

    const maxSeul = mesureC({ [COL_SEUIL_MAX]: '-3' })
    expect(maxSeul.ok).toBe(true)
    expect(maxSeul.ok && maxSeul.operation.values).toMatchObject({
      seuil_minimum: '',
      seuil_maximum: '-3',
    })
  })

  it('traite une borne blanche comme une borne absente', () => {
    // Oracle : «    » n'est pas un nombre illisible, c'est une case vide — elle
    // ne doit ni produire d'erreur ni écrire de seuil.
    const r = mesureC({ [COL_SEUIL_MIN]: '   ', [COL_SEUIL_MAX]: '  ' })
    expect(r.ok).toBe(true)
    expect(r.ok && r.operation.values).toMatchObject({
      seuil_minimum: '',
      seuil_maximum: '',
    })
  })

  it('rogne les espaces des bornes et de la description', () => {
    // Oracle : les cellules d'un collage sont rognées avant écriture.
    const r = mesureC({
      [COL_OPERATION]: '  Relever la température  ',
      [COL_SEUIL_MIN]: ' 18,5 ',
      [COL_SEUIL_MAX]: ' 24 ',
      [COL_OP_DESCRIPTION]: '  Sonde murale  ',
    })
    expect(r.ok).toBe(true)
    expect(r.ok && r.operation.values).toMatchObject({
      nom: 'Relever la température',
      seuil_minimum: '18.5',
      seuil_maximum: '24',
      description: 'Sonde murale',
    })
  })
})

describe('blocColonnesOperation — le prompt est le contrat donné à l’IA', () => {
  // Appelé DANS chaque test (jamais au chargement du fichier) : un bloc vide ou
  // absent doit faire échouer un test, pas la collecte de la suite.
  const bloc = () => blocColonnesOperation(refsRiches)
  const texteDuBloc = () => bloc().join('\n')

  it('décrit UNE puce par colonne (les deux seuils partageant la leur)', () => {
    // Oracle : 7 colonnes d'opération, 6 puces — l'IA doit trouver une consigne
    // pour chacune, sinon elle invente.
    const texte = texteDuBloc()
    expect(bloc()).toHaveLength(6)
    expect(texte).toContain(`- ${COL_OPERATION} — obligatoire.`)
    expect(texte).toContain(`- ${COL_ORDRE} — optionnel.`)
    expect(texte).toContain(`- ${COL_TYPE} — obligatoire.`)
    expect(texte).toContain(`- ${COL_UNITE} — obligatoire UNIQUEMENT si`)
    expect(texte).toContain(
      `- ${COL_SEUIL_MIN} et ${COL_SEUIL_MAX} — optionnels`,
    )
    expect(texte).toContain(`- ${COL_OP_DESCRIPTION} — optionnel.`)
  })

  it('énumère TOUS les types du référentiel, et seulement les types à seuils comme porteurs d’unité', () => {
    // Oracle : le prompt recopie le référentiel. S'il énumérait « Vérification »
    // parmi les types à unité, l'IA remplirait une unité que le parseur efface.
    const texte = texteDuBloc()
    expect(texte).toContain(
      'UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : « Vérification », « Mesure », « Relevé de compteur ».',
    )
    expect(texte).toContain(
      `si ${COL_TYPE} vaut « Mesure » ou « Relevé de compteur », à laisser VIDE sinon`,
    )
  })

  it('énumère TOUTES les unités, et seulement celles à bornes comme porteuses de seuils', () => {
    // Oracle : même règle côté unités ; l'unité sans symbole s'écrit sans
    // parenthèses vides.
    const texte = texteDuBloc()
    expect(texte).toContain(
      '« Degrés Celsius (°C) », « Pourcentage (%) », « Heure (h) », « Passage ».',
    )
    expect(texte).toContain(
      'pour les unités à bornes (Degrés Celsius (°C), Pourcentage (%))',
    )
  })

  it('énonce les conventions que le parseur applique vraiment', () => {
    // Oracle : tout ce que le parseur impose doit être écrit dans le prompt —
    // ordre vide = 0, virgule décimale, min ≤ max.
    const texte = texteDuBloc()
    expect(texte).toContain('Vide = 0')
    expect(texte).toContain('virgule comme séparateur décimal')
    expect(texte).toContain('le minimum inférieur ou égal au maximum')
  })
})

describe('parseNombreFr', () => {
  it('distingue « vide » de « zéro »', () => {
    // Oracle : une cellule vide n'est PAS 0 — un seuil absent et un seuil à 0
    // ne veulent pas dire la même chose (piège connu des seuils de compteur).
    expect(parseNombreFr('')).toBeNull()
    expect(parseNombreFr('   ')).toBeNull()
    expect(parseNombreFr('0')).toBe(0)
  })

  it('supprime les espaces de milliers et accepte les deux séparateurs décimaux', () => {
    // Oracle : « 1 234,5 » est l'écriture française d'un nombre.
    expect(parseNombreFr('1 234,5')).toBe(1234.5)
    expect(parseNombreFr(' 6,5 ')).toBe(6.5)
    expect(parseNombreFr('-2,25')).toBe(-2.25)
  })

  it('refuse tout ce qui n’est pas un nombre fini', () => {
    // Oracle : `Number` accepte « Infinity » et « » ; pas nous.
    expect(parseNombreFr('Infinity')).toBeNull()
    expect(parseNombreFr('6,5,4')).toBeNull()
    expect(parseNombreFr('12 €')).toBeNull()
  })

  it('relit tout nombre décimal écrit à la française (propriété)', () => {
    // Oracle : écrire un nombre avec la virgule puis le relire doit redonner le
    // même nombre.
    fc.assert(
      fc.property(
        fc.integer({ min: -99_999, max: 99_999 }),
        fc.integer({ min: 0, max: 99 }),
        (entier, decimales) => {
          const brut = `${String(entier)},${String(decimales).padStart(2, '0')}`
          const attendu = Number(brut.replace(',', '.'))
          return parseNombreFr(brut) === attendu
        },
      ),
      { seed: 20260916, numRuns: 200 },
    )
  })
})

describe('parseOuiNon', () => {
  it('accepte toutes les écritures du OUI', () => {
    // Oracle : la liste est fermée et documentée ; chaque écriture compte.
    for (const brut of ['oui', 'o', 'true', 'vrai', '1', 'x', ' OUI ', 'X']) {
      expect(parseOuiNon(brut), `« ${brut} » vaut oui`).toBe(true)
    }
  })

  it('accepte toutes les écritures du NON', () => {
    for (const brut of ['non', 'n', 'false', 'faux', '0', ' NON ']) {
      expect(parseOuiNon(brut), `« ${brut} » vaut non`).toBe(false)
    }
  })

  it('distingue « non renseigné » de « non »', () => {
    // Oracle : une cellule vide est une ABSENCE de réponse (null), pas un
    // « non » — sinon un oubli devient une réponse.
    expect(parseOuiNon('')).toBeNull()
    expect(parseOuiNon('   ')).toBeNull()
    expect(parseOuiNon('peut-être')).toBeNull()
    expect(parseOuiNon('2')).toBeNull()
  })
})

/** Construit une opération résolue de toutes pièces, pour l'aperçu. */
const resolue = (values: Partial<OperationCsvValues>): OperationCsvResolue => ({
  values: {
    nom: '',
    ordre: '',
    type_operation_id: '',
    unite_id: '',
    seuil_minimum: '',
    seuil_maximum: '',
    description: '',
    ...values,
  },
  aUnite: false,
  requiresSeuils: false,
})

describe('resumeOperation — l’aperçu ligne par ligne', () => {
  it('n’affiche que le libellé quand il n’y a rien d’autre', () => {
    // Oracle : pas de tiret orphelin, pas de parenthèses vides.
    expect(
      resumeOperation(resolue({ nom: 'Nettoyer les filtres' }), refs),
    ).toBe('Nettoyer les filtres')
  })

  it('ajoute LE type puis L’unité désignés par leurs identifiants', () => {
    // Oracle : le résumé relit le référentiel par id ; il doit montrer le type
    // n° 4 et l'unité n° 1, pas les premiers venus.
    expect(
      resumeOperation(
        resolue({ nom: 'Relever', type_operation_id: '4' }),
        refs,
      ),
    ).toBe('Relever — Mesure')
    expect(
      resumeOperation(
        resolue({ nom: 'Relever', type_operation_id: '4', unite_id: '1' }),
        refs,
      ),
    ).toBe('Relever — Mesure, Degrés Celsius (°C)')
  })

  it('réaffiche les bornes à la française', () => {
    // Oracle : la base stocke « 18.5 », l'humain lit « 18,5 ».
    expect(
      resumeOperation(
        resolue({
          nom: 'Relever',
          type_operation_id: '4',
          unite_id: '1',
          seuil_minimum: '18.5',
          seuil_maximum: '24',
        }),
        refs,
      ),
    ).toBe('Relever — Mesure, Degrés Celsius (°C) (18,5 → 24)')
  })

  it('remplace la borne absente par des points de suspension, pas par du vide', () => {
    // Oracle : « (18,5 → …) » dit « pas de maximum » ; « (18,5 → ) » ne dit rien.
    expect(
      resumeOperation(resolue({ nom: 'Relever', seuil_minimum: '18.5' }), refs),
    ).toBe('Relever (18,5 → …)')
    expect(
      resumeOperation(resolue({ nom: 'Relever', seuil_maximum: '24' }), refs),
    ).toBe('Relever (… → 24)')
  })

  it('ne montre aucune parenthèse quand aucune borne n’est posée', () => {
    expect(
      resumeOperation(
        resolue({ nom: 'Relever', type_operation_id: '1' }),
        refs,
      ),
    ).toBe('Relever — Vérification')
  })

  it('ignore un identifiant absent du référentiel', () => {
    // Oracle : un id inconnu n'affiche RIEN plutôt que « undefined ».
    expect(
      resumeOperation(
        resolue({ nom: 'Relever', type_operation_id: '999', unite_id: '999' }),
        refs,
      ),
    ).toBe('Relever')
  })
})

describe('texteValeur', () => {
  it('rend les valeurs du JSONB specifications lisibles', () => {
    // Oracle : `null` = non renseigné (chaîne vide) ; un booléen se lit
    // « Oui »/« Non » en français ; tout le reste se lit tel quel.
    expect(texteValeur(null)).toBe('')
    expect(texteValeur(true)).toBe('Oui')
    expect(texteValeur(false)).toBe('Non')
    expect(texteValeur(0)).toBe('0')
    expect(texteValeur(42)).toBe('42')
    expect(texteValeur('')).toBe('')
    expect(texteValeur('Classe 2')).toBe('Classe 2')
  })
})
