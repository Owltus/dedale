import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formaterCsv } from '@/lib/csv'
import { champValeurEnTexte, type Champ } from '@/lib/champs'
import {
  buildImportPrompt,
  parseImportCsv,
  type CsvImportRowOk,
  type EquipementExistantPourImport,
  type LocalPourImport,
} from './csv-import'

// Tests de PROPRIÉTÉS sur le seul module d'import CSV qui n'en avait pas.
// L'entrée est du texte produit par une IA générative puis collé : elle est
// par construction NON FIABLE. Les invariants visés sont ceux d'un lecteur
// d'entrée hostile : totalité (ne jamais jeter), absence de succès silencieux
// (jamais de ligne « ok » à laquelle il manque une donnée), et indépendance
// vis-à-vis de la mise en forme (ordre des colonnes, colonnes en trop, BOM).
const RUNS = { numRuns: 500, seed: 42 } as const

const locaux: LocalPourImport[] = [
  {
    local_id: 'l1',
    local_nom: 'Accueil',
    chemin_court: 'Tour A › RDC › Accueil',
  },
  {
    local_id: 'l2',
    local_nom: 'Local technique',
    chemin_court: 'Tour A › RDC › Local technique',
  },
  // Homonyme volontaire : « Local technique » seul devient AMBIGU.
  {
    local_id: 'l3',
    local_nom: 'Local technique',
    chemin_court: 'Tour A › R+1 › Local technique',
  },
]
const IDS_CONNUS = ['l1', 'l2', 'l3']

const gabarit: Champ[] = [
  { cle: 'Marque', type: 'texte', requis: true, defaut: null },
  {
    cle: 'Puissance',
    type: 'nombre',
    unite: 'kW',
    requis: false,
    defaut: null,
  },
  {
    cle: 'Classe',
    type: 'liste',
    options: ['A', 'B'],
    requis: false,
    defaut: 'A',
  },
  { cle: 'Sous garantie', type: 'oui-non', requis: false, defaut: null },
]

const COL_LOCAL = 'Local'
const COL_MES = 'Date de mise en service'
const COL_GARANTIE = 'Date de fin de garantie'
const COLONNES = [
  COL_LOCAL,
  'Marque',
  'Puissance',
  'Classe',
  'Sous garantie',
  COL_MES,
  COL_GARANTIE,
]
const VALEURS: Record<string, string> = {
  [COL_LOCAL]: 'Accueil',
  Marque: 'Bosch',
  Puissance: '6,5',
  Classe: 'b',
  'Sous garantie': 'OUI',
  [COL_MES]: '01/02/2026',
  [COL_GARANTIE]: '29/02/2028',
}
const ENTETE = COLONNES.join(';')
/** Marque d'ordre des octets U+FEFF : Excel la place en tête de ses exports. */
const BOM = '\uFEFF'

/** Dernière phrase du prompt : les données brutes se collent juste après. */
const INVITATION =
  'Voici les données brutes à convertir (colle-les à la suite de ce message) :'

const ok = (lignes: ReturnType<typeof parseImportCsv>['lignes']) =>
  lignes.filter((l): l is CsvImportRowOk => l.ok)
const erreurs = (lignes: ReturnType<typeof parseImportCsv>['lignes']) =>
  lignes.flatMap((l) => (l.ok ? [] : l.erreurs))
/** Empreinte comparable d'une ligne importée, indépendante de l'ordre des colonnes. */
const empreinte = (l: CsvImportRowOk) => ({
  localId: l.localId,
  dateMiseEnService: l.dateMiseEnService,
  dateFinGarantie: l.dateFinGarantie,
  champs: [...l.champs]
    // `champValeurEnTexte` et non `String()` : une double référence est un objet,
    // que `String()` réduirait à « [object Object] » — le test comparerait alors
    // deux lignes indiscernables et passerait au vert à tort.
    .map((c) => `${c.cle}=${champValeurEnTexte(c.valeur ?? null)}`)
    .sort((a, b) => a.localeCompare(b)),
})

describe('parseImportCsv (équipements) — cas nominal', () => {
  it('résout le local, convertit chaque caractéristique et les deux dates', () => {
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;6,5;b;OUI;01/02/2026;29/02/2028`,
      gabarit,
      locaux,
    )
    expect(r.colonnesManquantes).toEqual([])
    const [l] = ok(r.lignes)
    expect(l).toMatchObject({
      ligne: 2,
      localId: 'l1',
      dateMiseEnService: '2026-02-01',
      dateFinGarantie: '2028-02-29', // 2028 est bissextile
    })
    expect(l?.champs.map((c) => [c.cle, c.valeur])).toEqual([
      ['Marque', 'Bosch'],
      ['Puissance', 6.5],
      ['Classe', 'B'], // option CANONIQUE du gabarit, pas la casse tapée
      ['Sous garantie', true],
    ])
  })

  it('résout un local par son chemin, et refuse un nom ambigu ou inconnu', () => {
    // ORACLE : règle du module — chemin d'abord, nom seul toléré s'il est
    // UNIQUE. Deux locaux homonymes ne doivent jamais être départagés au
    // hasard : rattacher un équipement au mauvais local est irréparable.
    const r = parseImportCsv(
      `${ENTETE}\nTour A › R+1 › Local technique;Bosch;;;;;\nLocal technique;Bosch;;;;;\nCave;Bosch;;;;;\n;Bosch;;;;;`,
      gabarit,
      locaux,
    )
    expect(r.lignes.map((l) => l.ok)).toEqual([true, false, false, false])
    expect(ok(r.lignes)[0]?.localId).toBe('l3')
    const e = erreurs(r.lignes)
    expect(e[0]).toContain('ambigu')
    expect(e[1]).toContain('introuvable')
    expect(e[2]).toContain('obligatoire')
  })
})

describe('parseImportCsv (équipements) — en-têtes', () => {
  it('refuse TOUT l’import dès qu’une colonne attendue manque', () => {
    // ORACLE : pas d'import partiel silencieux. Si une colonne du gabarit
    // manque, les valeurs correspondantes seraient perdues sans qu'on le voie :
    // le module doit donc rendre 0 ligne et la liste des colonnes manquantes.
    fc.assert(
      fc.property(
        fc.shuffledSubarray(COLONNES, {
          minLength: 1,
          maxLength: COLONNES.length - 1,
        }),
        (gardees) => {
          const r = parseImportCsv(
            `${gardees.join(';')}\n${gardees.map((c) => VALEURS[c] ?? '').join(';')}`,
            gabarit,
            locaux,
          )
          const attenduManquantes = [
            COL_LOCAL,
            ...gabarit.map((c) => c.cle),
          ].filter((c) => !gardees.includes(c))
          expect(r.colonnesManquantes).toEqual(attenduManquantes)
          if (attenduManquantes.length > 0) expect(r.lignes).toEqual([])
        },
      ),
      RUNS,
    )
  })

  it('les deux colonnes de date sont FACULTATIVES (elles ne bloquent rien)', () => {
    // ORACLE : seules `Local` et les caractéristiques du gabarit sont exigées ;
    // le prompt décrit les dates comme optionnelles.
    const sansDates = COLONNES.filter(
      (c) => c !== COL_MES && c !== COL_GARANTIE,
    )
    const r = parseImportCsv(
      `${sansDates.join(';')}\n${sansDates.map((c) => VALEURS[c] ?? '').join(';')}`,
      gabarit,
      locaux,
    )
    expect(r.colonnesManquantes).toEqual([])
    expect(ok(r.lignes)[0]?.dateMiseEnService).toBeUndefined()
  })

  it('l’ordre des colonnes n’a aucune influence sur le résultat', () => {
    // ORACLE : le CSV est écrit par une IA ; l'ordre des colonnes est une
    // convention d'affichage, pas une donnée. Toute permutation de l'en-tête
    // doit produire EXACTEMENT le même équipement.
    const reference = empreinte(
      ok(
        parseImportCsv(
          `${ENTETE}\n${COLONNES.map((c) => VALEURS[c] ?? '').join(';')}`,
          gabarit,
          locaux,
        ).lignes,
      )[0]!,
    )
    fc.assert(
      fc.property(
        fc.shuffledSubarray(COLONNES, {
          minLength: COLONNES.length,
          maxLength: COLONNES.length,
        }),
        (permutation) => {
          const r = parseImportCsv(
            formaterCsv(permutation, [
              permutation.map((c) => VALEURS[c] ?? ''),
            ]),
            gabarit,
            locaux,
          )
          expect(r.colonnesManquantes).toEqual([])
          expect(empreinte(ok(r.lignes)[0]!)).toEqual(reference)
        },
      ),
      RUNS,
    )
  })

  it('les colonnes inconnues sont ignorées, où qu’elles soient', () => {
    // ORACLE : une colonne surnuméraire (« Commentaire », « N° » ajoutés par
    // l'IA) ne doit ni décaler les autres ni faire échouer l'import.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            nom: fc.constantFrom('Commentaire', 'N°', 'Source', 'Divers'),
            valeur: fc.constantFrom('', 'x', 'Accueil', '9,9'),
            position: fc.nat({ max: COLONNES.length }),
          }),
          { maxLength: 3 },
        ),
        (extras) => {
          const noms = [...COLONNES]
          const vals = COLONNES.map((c) => VALEURS[c] ?? '')
          for (const e of extras) {
            const i = Math.min(e.position, noms.length)
            noms.splice(i, 0, e.nom)
            vals.splice(i, 0, e.valeur)
          }
          const r = parseImportCsv(formaterCsv(noms, [vals]), gabarit, locaux)
          expect(r.colonnesManquantes).toEqual([])
          expect(ok(r.lignes)).toHaveLength(1)
        },
      ),
      RUNS,
    )
  })

  it('les en-têtes sont insensibles à la casse et aux blancs (BOM compris)', () => {
    // ORACLE : Excel préfixe ses exports d'un BOM UTF-8 (`telechargerCsv` en
    // écrit un lui-même). `parseCsv` le retire désormais lui-même, et le trim
    // des en-têtes reste un second filet — ce test verrouille les deux.
    const entete = `${BOM}  ${COL_LOCAL.toUpperCase()} ;marque; Puissance;CLASSE;sous garantie;${COL_MES};${COL_GARANTIE}`
    const r = parseImportCsv(
      `${entete}\nAccueil;Bosch;6,5;b;OUI;01/02/2026;`,
      gabarit,
      locaux,
    )
    expect(r.colonnesManquantes).toEqual([])
    expect(ok(r.lignes)[0]?.localId).toBe('l1')
  })
})

describe('parseImportCsv (équipements) — lignes irrégulières', () => {
  it('une ligne trop courte est refusée avec une erreur par donnée manquante', () => {
    // ORACLE : des cellules absentes valent des cellules VIDES — donc défaut
    // pour un champ optionnel, erreur pour `Local` et pour un champ requis.
    // Jamais un `undefined` qui filerait jusqu'en base.
    const r = parseImportCsv(`${ENTETE}\nAccueil`, gabarit, locaux)
    expect(erreurs(r.lignes)).toEqual(['« Marque » est obligatoire.'])
    const vide = parseImportCsv(`${ENTETE}\n`, gabarit, locaux)
    expect(vide.lignes).toEqual([]) // ligne blanche finale : pas d'erreur fantôme
  })

  it('une ligne trop longue ignore le surplus sans décaler les colonnes', () => {
    // ORACLE : les colonnes sont adressées par leur INDEX d'en-tête ; du
    // surplus à droite ne peut pas modifier la lecture des colonnes connues.
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('x', '', '9', 'Oui'), {
          minLength: 1,
          maxLength: 4,
        }),
        (surplus) => {
          const r = parseImportCsv(
            `${ENTETE}\nAccueil;Bosch;6,5;b;OUI;01/02/2026;29/02/2028;${surplus.join(';')}`,
            gabarit,
            locaux,
          )
          expect(ok(r.lignes)[0]?.localId).toBe('l1')
          expect(ok(r.lignes)[0]?.dateFinGarantie).toBe('2028-02-29')
        },
      ),
      RUNS,
    )
  })

  it('une ligne entièrement vide mais « à colonnes » produit des erreurs explicites', () => {
    // ORACLE : `;;;;;;` n'est pas une ligne blanche (elle a 7 colonnes) : la
    // refuser en expliquant vaut mieux que créer un équipement fantôme.
    const r = parseImportCsv(`${ENTETE}\n;;;;;;`, gabarit, locaux)
    expect(r.lignes.map((l) => l.ok)).toEqual([false])
    expect(erreurs(r.lignes)).toEqual([
      'Local est obligatoire.',
      '« Marque » est obligatoire.',
    ])
  })

  it('une valeur de caractéristique invalide bloque la ligne, une par une', () => {
    // ORACLE : chaque cellule fautive donne SON message ; l'utilisateur doit
    // pouvoir tout corriger en une passe plutôt qu'erreur après erreur.
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;douze;C;Peut-être;31/02/2026;07-06-2026`,
      gabarit,
      locaux,
    )
    const e = erreurs(r.lignes)
    expect(e).toHaveLength(5)
    // Apostrophes droites : ce sont celles des messages de `champs.ts`.
    expect(e[0]).toContain("n'est pas un nombre.")
    expect(e[1]).toContain("n'est pas une valeur autorisée (A, B)")
    expect(e[2]).toContain('« Oui » ou « Non »')
    expect(e[3]).toContain(COL_MES) // 31/02 n'existe pas au calendrier
    expect(e[4]).toContain(COL_GARANTIE) // format ISO refusé
  })

  it('les cellules vides prennent la valeur par défaut du gabarit', () => {
    // ORACLE : règle partagée de `resoudreValeurTexte` — vide ⇒ défaut, sauf
    // si le champ est requis.
    const r = parseImportCsv(`${ENTETE}\nAccueil;Bosch;;;;;`, gabarit, locaux)
    expect(ok(r.lignes)[0]?.champs.map((c) => c.valeur)).toEqual([
      'Bosch',
      null,
      'A', // défaut de la liste
      null,
    ])
  })
})

describe('parseImportCsv (équipements) — résolution du local', () => {
  it('ignore les blancs autour du nom de local', () => {
    // ORACLE : le nom de local est recopié par une IA depuis une liste ; les
    // blancs qui l'entourent sont de la mise en forme. Les refuser
    // renverrait « introuvable » sur un nom pourtant exact.
    const r = parseImportCsv(
      `${ENTETE}\n  Accueil  ;Bosch;;;;;`,
      gabarit,
      locaux,
    )
    expect(ok(r.lignes)[0]?.localId).toBe('l1')
  })

  it('ne trébuche pas sur un local sans chemin ni sur un local sans nom', () => {
    // ORACLE : la liste vient d'une vue SQL — chemin et nom peuvent être
    // NULL. Un local incomplet ne doit ni faire échouer la résolution des
    // autres, ni être choisi par défaut.
    const partiels: LocalPourImport[] = [
      { local_id: null, local_nom: 'Réserve', chemin_court: null },
      {
        local_id: 'l9',
        local_nom: null,
        chemin_court: 'Tour B › RDC › Sans nom',
      },
      {
        local_id: 'l1',
        local_nom: 'Accueil',
        chemin_court: 'Tour A › RDC › Accueil',
      },
    ]
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;;;;;\nTour B › RDC › Sans nom;Bosch;;;;;\nRéserve;Bosch;;;;;`,
      gabarit,
      partiels,
    )
    expect(r.lignes.map((l) => (l.ok ? l.localId : l.erreurs))).toEqual([
      'l1',
      'l9',
      // Sans identifiant, le local n'est pas rattachable : « introuvable »
      // — surtout pas « ambigu », qui enverrait chercher un homonyme inexistant.
      ['Local « Réserve » introuvable sur ce site.'],
    ])
  })

  it('nomme les homonymes dans le message d’ambiguïté', () => {
    // ORACLE : « ambigu » sans la liste des candidats n'aide personne ; le
    // message doit donner les CHEMINS à recopier pour trancher.
    const r = parseImportCsv(
      `${ENTETE}\nLocal technique;Bosch;;;;;`,
      gabarit,
      locaux,
    )
    expect(erreurs(r.lignes)).toEqual([
      'Local « Local technique » est ambigu (plusieurs locaux portent ce nom : Tour A › RDC › Local technique, Tour A › R+1 › Local technique) — utilise le chemin complet.',
    ])
  })

  it('traite une cellule Local ABSENTE comme vide, pas comme un nom', () => {
    // ORACLE : l'IA tronque les lignes dont la fin est vide. Une colonne Local
    // placée en dernier peut donc manquer : c'est « obligatoire », jamais un
    // nom de local introuvable.
    const entete = [
      'Marque',
      'Puissance',
      'Classe',
      'Sous garantie',
      COL_LOCAL,
    ].join(';')
    const r = parseImportCsv(`${entete}\nBosch;;;`, gabarit, locaux)
    expect(erreurs(r.lignes)).toEqual(['Local est obligatoire.'])
  })

  it('traite une date faite de blancs comme une date absente', () => {
    // ORACLE : une cellule de blancs n'est pas une saisie. La refuser
    // (« invalide (JJ/MM/AAAA) ») accuserait l'utilisateur d'une date qu'il
    // n'a pas écrite.
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;;;;   ;   `,
      gabarit,
      locaux,
    )
    expect(erreurs(r.lignes)).toEqual([])
    expect(r.lignes[0]).toMatchObject({
      ok: true,
      dateMiseEnService: undefined,
      dateFinGarantie: undefined,
    })
  })
})

describe('parseImportCsv (équipements) — doublons', () => {
  const existants: EquipementExistantPourImport[] = [
    { localId: 'l1', principal: 'Bosch', titre: 'Chaudière Bosch' },
    { localId: 'l2', principal: 'Atlantic', titre: 'Chaudière Atlantic' },
  ]

  it('avertit sans bloquer quand un équipement occupe déjà le local', () => {
    // ORACLE : l'import ne fait que CRÉER — le risque n'est jamais la perte de
    // données mais la création en trop. Un doublon probable doit donc être
    // signalé (`avertissement`) tout en restant importable (`ok: true`).
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;;;;;\nAccueil;Viessmann;;;;;\nTour A › R+1 › Local technique;Bosch;;;;;`,
      gabarit,
      locaux,
      'Marque',
      existants,
    )
    const lignes = ok(r.lignes)
    expect(lignes).toHaveLength(3)
    expect(lignes[0]?.avertissement).toContain('Doublon probable')
    expect(lignes[1]?.avertissement).toContain('existe déjà à cet emplacement')
    expect(lignes[2]?.avertissement).toBeUndefined() // local libre
  })

  it('le doublon « quasi certain » se compare sans tenir compte de la casse', () => {
    // ORACLE : « BOSCH » et « Bosch » désignent la même marque ; un doublon ne
    // doit pas passer entre les mailles pour une majuscule.
    fc.assert(
      fc.property(
        fc.constantFrom('bosch', 'BOSCH', 'BoScH', '  Bosch  '),
        (saisi) => {
          const r = parseImportCsv(
            `${ENTETE}\nAccueil;${saisi};;;;;`,
            gabarit,
            locaux,
            'Marque',
            existants,
          )
          expect(ok(r.lignes)[0]?.avertissement).toContain('Doublon probable')
        },
      ),
      RUNS,
    )
  })

  it('ne crie au doublon que si la valeur principale COÏNCIDE', () => {
    // ORACLE : deux équipements peuvent légitimement partager un local (deux
    // extincteurs dans un hall). Seule l'égalité sur le champ principal rend
    // le doublon quasi certain ; sinon l'avertissement doit rester prudent,
    // sans quoi l'utilisateur apprendrait à l'ignorer.
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Viessmann;;;;;`,
      gabarit,
      locaux,
      'Marque',
      existants,
    )
    expect(ok(r.lignes)[0]?.avertissement).toBe(
      "Un équipement existe déjà à cet emplacement (Chaudière Bosch) — vérifie qu'il ne s'agit pas d'un doublon.",
    )
  })

  it('cite TOUS les équipements déjà présents dans le local', () => {
    // ORACLE : l'avertissement sert à trancher ; n'en nommer qu'un laisserait
    // croire que le local n'en contient qu'un.
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Viessmann;;;;;`,
      gabarit,
      locaux,
      'Marque',
      [
        ...existants,
        { localId: 'l1', principal: 'De Dietrich', titre: 'Ballon tampon' },
      ],
    )
    expect(ok(r.lignes)[0]?.avertissement).toBe(
      "Un équipement existe déjà à cet emplacement (Chaudière Bosch, Ballon tampon) — vérifie qu'il ne s'agit pas d'un doublon.",
    )
  })

  it('reste prudent si le champ principal désigné n’existe pas au gabarit', () => {
    // ORACLE : la sous-catégorie peut désigner un champ principal retiré
    // depuis. Sans valeur à comparer, on avertit — on ne casse pas l'import.
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;;;;;`,
      gabarit,
      locaux,
      'Champ retiré',
      existants,
    )
    expect(ok(r.lignes)[0]?.avertissement).toContain(
      'existe déjà à cet emplacement',
    )
  })

  it('reste prudent quand la ligne ne renseigne PAS le champ principal', () => {
    // ORACLE : une cellule vide ne prouve rien. Comparer « rien » à une valeur
    // en base ne permet pas d'affirmer le doublon.
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;;;;;`,
      gabarit,
      locaux,
      'Puissance', // colonne laissée vide, défaut null
      existants,
    )
    expect(ok(r.lignes)[0]?.avertissement).toContain(
      'existe déjà à cet emplacement',
    )
  })

  it('rapproche deux équipements dont le champ principal est vide des deux côtés', () => {
    // ORACLE : « absence de valeur » est une valeur comme une autre pour
    // comparer — deux équipements sans référence au même local sont le même
    // équipement, jusqu'à preuve du contraire.
    const avecRef: Champ[] = [
      { cle: 'Réf', type: 'texte', requis: false, defaut: '' },
    ]
    const r = parseImportCsv('Local;Réf\nAccueil;', avecRef, locaux, 'Réf', [
      { localId: 'l1', principal: undefined, titre: 'Chaudière sans réf' },
    ])
    expect(ok(r.lignes)[0]?.avertissement).toBe(
      'Doublon probable : « Chaudière sans réf » existe déjà à cet emplacement avec la même valeur.',
    )
  })

  it('sans champ principal désigné, l’avertissement reste prudent', () => {
    // ORACLE : sans valeur discriminante, on ne peut affirmer le doublon — on
    // signale seulement la coïncidence de local.
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;;;;;`,
      gabarit,
      locaux,
      null,
      existants,
    )
    expect(ok(r.lignes)[0]?.avertissement).toBe(
      "Un équipement existe déjà à cet emplacement (Chaudière Bosch) — vérifie qu'il ne s'agit pas d'un doublon.",
    )
  })
})

describe('parseImportCsv (équipements) — fuzzing', () => {
  /** CSV aléatoire : parfois du bruit pur, parfois un vrai en-tête + lignes folles. */
  const cellule = fc.constantFrom(
    '',
    ' ',
    'Accueil',
    'ACCUEIL',
    'Local technique',
    'Tour A › RDC › Accueil',
    'Bosch',
    '6,5',
    '1,2,3',
    '0x10',
    'b',
    'C',
    'Oui',
    'Peut-être',
    '01/02/2026',
    '31/02/2026',
    '2026-02-01',
    '"',
    ';',
    'é😀',
    'x'.repeat(80),
  )
  const corps = fc
    .array(fc.array(cellule, { maxLength: 9 }), { maxLength: 6 })
    .map((rows) => rows.map((r) => r.join(';')).join('\n'))
  const csvAleatoire = fc.oneof(
    fc.string(),
    corps,
    corps.map((c) => `${ENTETE}\n${c}`),
    corps.map((c) => `${BOM}${ENTETE}\n${c}`),
    fc
      .tuple(fc.shuffledSubarray(COLONNES, { minLength: 1 }), corps)
      .map(([cols, c]) => `${cols.join(';')}\n${c}`),
  )

  it('ne jette jamais et n’accepte jamais une ligne en silence', () => {
    // ORACLE (le cœur du module) : pour TOUTE entrée, chaque ligne est soit un
    // succès COMPLET (local résolu + toutes les caractéristiques du gabarit
    // présentes + dates ISO ou absentes), soit un échec MOTIVÉ (au moins une
    // erreur lisible). Un « ok » amputé d'une caractéristique serait une perte
    // de données silencieuse — c'est exactement ce que cette propriété interdit.
    fc.assert(
      fc.property(csvAleatoire, (texte) => {
        const r = parseImportCsv(texte, gabarit, locaux, 'Marque', [])
        // Colonnes manquantes ⇒ aucun import partiel.
        if (r.colonnesManquantes.length > 0) expect(r.lignes).toEqual([])
        for (const l of r.lignes) {
          if (!l.ok) {
            expect(l.erreurs.length).toBeGreaterThan(0)
            expect(l.erreurs.every((e) => e.trim() !== '')).toBe(true)
            continue
          }
          expect(IDS_CONNUS).toContain(l.localId)
          expect(l.champs.map((c) => c.cle)).toEqual(gabarit.map((c) => c.cle))
          for (const d of [l.dateMiseEnService, l.dateFinGarantie]) {
            if (d !== undefined)
              expect(/^\d{4}-\d{2}-\d{2}$/.test(d)).toBe(true)
          }
        }
        // Numérotation : strictement croissante et jamais avant la 2e ligne.
        const numeros = r.lignes.map((l) => l.ligne)
        expect(numeros).toEqual([...numeros].sort((a, b) => a - b))
        expect(numeros.every((n) => n >= 2)).toBe(true)
      }),
      { numRuns: 1000, seed: 42 },
    )
  })

  it('un texte sans aucune ligne de données n’importe rien et ne dit rien', () => {
    // ORACLE : caractérisation d'un cas limite — texte vide ⇒ ni colonne
    // manquante ni ligne. C'est à l'appelant (le dialog) de ne pas proposer
    // d'importer 0 équipement ; le parseur, lui, reste neutre.
    expect(parseImportCsv('', gabarit, locaux)).toEqual({
      colonnesManquantes: [],
      lignes: [],
    })
    expect(parseImportCsv('   \n  ', gabarit, locaux)).toEqual({
      colonnesManquantes: [],
      lignes: [],
    })
    expect(parseImportCsv(ENTETE, gabarit, locaux)).toEqual({
      colonnesManquantes: [],
      lignes: [],
    })
  })

  // RÉGRESSION : le numéro de ligne affiché à l'utilisateur désigne la ligne
  // du texte qu'il a collé, et non le rang après filtrage. `parseCsv`
  // supprimait les lignes blanches avant que `parseImportCsv` ne numérote
  // (`ligne = i + 2`) : dans
  //   "<en-tête>\nAccueil;Bosch;;;;;\n\nCave;Bosch;;;;;"
  // la 4e ligne du collage (« Cave », local introuvable) était rapportée
  // « ligne 3 ». Avec plusieurs lignes blanches le décalage s'accumulait, et
  // l'utilisateur corrigeait la mauvaise ligne de son fichier. `parseCsvIndexe`
  // conserve désormais le numéro d'origine.
  it('numérote les lignes comme dans le texte collé', () => {
    const r = parseImportCsv(
      `${ENTETE}\nAccueil;Bosch;;;;;\n\nCave;Bosch;;;;;`,
      gabarit,
      locaux,
    )
    const fautive = r.lignes.find((l) => !l.ok)
    expect(fautive?.ligne).toBe(4)
  })
})

describe('buildImportPrompt (équipements)', () => {
  it('décrit chaque colonne attendue, les locaux et les équipements à exclure', () => {
    // ORACLE : le prompt est le CONTRAT passé à l'IA ; toute colonne que
    // `parseImportCsv` exige doit y figurer, sinon l'import échouera
    // systématiquement sur un CSV pourtant « conforme au prompt ».
    const p = buildImportPrompt({
      sousCategorieNom: 'Chaudières',
      champs: gabarit,
      locaux,
      equipementsExistants: ['Chaudière Bosch'],
    })
    for (const colonne of COLONNES) expect(p).toContain(colonne)
    expect(p).toContain('« A », « B »') // options de la liste, recopiées
    expect(p).toContain('en kW') // unité du champ nombre
    expect(p).toContain('Tour A › RDC › Accueil')
    expect(p).toContain('Chaudière Bosch')
    expect(p).toContain('JJ/MM/AAAA')
  })

  it('reste cohérent avec le parseur : le CSV décrit par le prompt s’importe', () => {
    // ORACLE : propriété de BOUCLE — les noms de colonnes annoncés dans le
    // prompt, remis dans cet ordre, doivent donner un import sans colonne
    // manquante. C'est le seul garde-fou contre une dérive prompt/parseur.
    const p = buildImportPrompt({
      sousCategorieNom: 'Chaudières',
      champs: gabarit,
      locaux,
      equipementsExistants: [],
    })
    const annoncees = COLONNES.filter((c) => p.includes(`- ${c} —`))
    expect(annoncees).toEqual(COLONNES)
    const r = parseImportCsv(
      `${annoncees.join(';')}\n${annoncees.map((c) => VALEURS[c] ?? '').join(';')}`,
      gabarit,
      locaux,
    )
    expect(r.colonnesManquantes).toEqual([])
    expect(ok(r.lignes)).toHaveLength(1)
  })

  it('énonce toutes les règles de format que le parseur suppose', () => {
    // ORACLE : le prompt est le CONTRAT passé à l'IA. Chaque règle correspond
    // à une hypothèse du parseur (séparateur, en-tête unique, aucune phrase
    // parasite). Si elle disparaît du prompt, l'IA produit un CSV « conforme
    // au prompt » que l'import refusera.
    const lignes = buildImportPrompt({
      sousCategorieNom: 'Chaudières',
      champs: gabarit,
      locaux,
      equipementsExistants: [],
    }).split('\n')
    for (const regle of [
      'Format EXACT attendu :',
      '- Séparateur de colonnes : point-virgule ( ; )',
      '- Encodage : UTF-8',
      "- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre, puis une ligne par équipement.",
      "- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).",
      'Colonnes :',
      'Locaux existants sur ce site (utilise EXACTEMENT un de ces noms dans la colonne Local) :',
    ]) {
      expect(lignes).toContain(regle)
    }
  })

  it('décrit chaque caractéristique selon son type, son défaut et son unité', () => {
    // ORACLE : la description d'une colonne est la SEULE chose qui dira à
    // l'IA comment écrire la valeur. Elle doit refléter exactement ce que
    // `resoudreValeurTexte` accepte : liste close recopiée à l'identique,
    // virgule décimale sans l'unité, « Oui »/« Non », JJ/MM/AAAA. Un défaut
    // n'est annoncé que s'il en existe vraiment un.
    const champs: Champ[] = [
      { cle: 'Marque', type: 'texte', requis: true, defaut: null },
      { cle: 'Repère', type: 'texte', requis: false, defaut: '' },
      {
        cle: 'Puissance',
        type: 'nombre',
        unite: 'kW',
        requis: false,
        defaut: 6.5,
      },
      { cle: 'Débit', type: 'nombre', requis: false, defaut: null },
      {
        cle: 'Classe',
        type: 'liste',
        options: ['A', 'B'],
        requis: true,
        defaut: 'A',
      },
      { cle: 'Famille', type: 'liste', requis: false, defaut: null },
      { cle: 'Sous garantie', type: 'oui-non', requis: false, defaut: false },
      { cle: 'Pose', type: 'date', requis: false, defaut: null },
    ]
    const lignes = buildImportPrompt({
      sousCategorieNom: 'Chaudières',
      champs,
      locaux,
      equipementsExistants: [],
    }).split('\n')
    const puce = (cle: string) =>
      lignes.find((l) => l.startsWith(`- ${cle} — `))
    expect(puce('Marque')).toBe('- Marque — obligatoire. Texte libre.')
    // Un défaut vide n'est pas un défaut : ne pas l'annoncer.
    expect(puce('Repère')).toBe('- Repère — optionnel. Texte libre.')
    expect(puce('Puissance')).toBe(
      "- Puissance — optionnel (défaut : « 6.5 »). Un nombre en kW, virgule comme séparateur décimal (ex. « 6,5 »), sans l'unité dans la cellule.",
    )
    expect(puce('Débit')).toBe(
      "- Débit — optionnel. Un nombre, virgule comme séparateur décimal (ex. « 6,5 »), sans l'unité dans la cellule.",
    )
    expect(puce('Classe')).toBe(
      '- Classe — obligatoire (défaut : « A »). UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : « A », « B ».',
    )
    // Liste sans option déclarée : la phrase reste, la liste est simplement vide.
    expect(puce('Famille')).toBe(
      '- Famille — optionnel. UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : .',
    )
    expect(puce('Sous garantie')).toBe(
      '- Sous garantie — optionnel (défaut : « false »). Écris exactement « Oui » ou « Non ».',
    )
    expect(puce('Pose')).toBe('- Pose — optionnel. Format JJ/MM/AAAA.')
  })

  it('liste un local par ligne, en repliant sur le nom si le chemin manque', () => {
    // ORACLE : l'IA doit pouvoir recopier un nom TEL QUEL ; agglutinés sur une
    // seule ligne, les locaux ne sont plus recopiables. Un local sans chemin
    // reste proposé sous son nom seul plutôt que d'apparaître vide.
    const lignes = buildImportPrompt({
      sousCategorieNom: 'Chaudières',
      champs: gabarit,
      locaux: [
        ...locaux,
        { local_id: 'l4', local_nom: 'Réserve', chemin_court: null },
        { local_id: 'l5', local_nom: null, chemin_court: null },
      ],
      equipementsExistants: [],
    }).split('\n')
    const i = lignes.indexOf(
      'Locaux existants sur ce site (utilise EXACTEMENT un de ces noms dans la colonne Local) :',
    )
    // Une ligne vide sépare la liste des colonnes de celle des locaux.
    expect(lignes[i - 1]).toBe('')
    expect(lignes.slice(i + 1, i + 6)).toEqual([
      '- Tour A › RDC › Accueil',
      '- Tour A › RDC › Local technique',
      '- Tour A › R+1 › Local technique',
      '- Réserve',
      // Ni chemin ni nom : une puce vide, jamais « undefined ».
      '- ',
    ])
  })

  it('le dit franchement quand le site n’a aucun local', () => {
    // ORACLE : sans local, une liste vide laisserait l'IA inventer des noms.
    expect(
      buildImportPrompt({
        sousCategorieNom: 'Chaudières',
        champs: gabarit,
        locaux: [],
        equipementsExistants: [],
      }),
    ).toContain('(aucun local enregistré sur ce site pour l’instant)')
  })

  it('reste un document lisible : paragraphes séparés, invitation en dernier', () => {
    // ORACLE : le prompt est collé dans une IA avec les données brutes À LA
    // SUITE. Sa structure (un paragraphe par idée, une ligne vide entre
    // chacun, une invitation finale suivie d'une ligne vide) est ce qui évite
    // que les données collées se retrouvent soudées au texte d'instruction.
    const lignes = buildImportPrompt({
      sousCategorieNom: 'Chaudières',
      champs: gabarit,
      locaux,
      equipementsExistants: [],
    }).split('\n')
    expect(lignes[0]).toContain("importer une liste d'équipements")
    expect(lignes[1]).toBe('')
    expect(lignes[2]).toBe(
      "Sous-catégorie d'équipements ciblée : « Chaudières ». Chaque ligne du CSV = un équipement de ce type.",
    )
    expect(lignes[3]).toBe('')
    expect(lignes[4]).toBe('Format EXACT attendu :')
    expect(lignes[lignes.indexOf('Colonnes :') - 1]).toBe('')

    const i = lignes.indexOf(INVITATION)
    expect(i).toBeGreaterThan(0)
    expect(lignes[i - 1]).toBe('')
    // Sans équipement existant, la liste des locaux mène directement à l'invitation.
    expect(lignes[i - 2]).toBe('- Tour A › R+1 › Local technique')
    expect(lignes.slice(i + 1)).toEqual([''])
  })

  it('n’ouvre la liste des équipements existants que s’il y en a', () => {
    // ORACLE : annoncer une liste vide invite l'IA à la remplir — exactement
    // le doublon qu'on cherche à éviter.
    expect(
      buildImportPrompt({
        sousCategorieNom: 'Chaudières',
        champs: gabarit,
        locaux,
        equipementsExistants: [],
      }),
    ).not.toContain('Équipements DÉJÀ enregistrés')

    const lignes = buildImportPrompt({
      sousCategorieNom: 'Chaudières',
      champs: gabarit,
      locaux,
      equipementsExistants: ['Chaudière Bosch', 'Ballon tampon'],
    }).split('\n')
    const i = lignes.indexOf(
      "Équipements DÉJÀ enregistrés dans cette sous-catégorie (ne les remets PAS dans le CSV, même si le document source les mentionne — génère uniquement les équipements qui n'y figurent pas encore) :",
    )
    expect(i).toBeGreaterThan(0)
    expect(lignes[i - 1]).toBe('')
    expect(lignes[i - 2]).toBe('- Tour A › R+1 › Local technique')
    expect(lignes.slice(i + 1, i + 3)).toEqual([
      '- Chaudière Bosch',
      '- Ballon tampon',
    ])
    expect(lignes[i + 3]).toBe('')
    expect(lignes[i + 4]).toBe(INVITATION)
  })
})
