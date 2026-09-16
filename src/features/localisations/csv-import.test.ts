import { describe, expect, it } from 'vitest'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ArbreExistant,
  type ContexteImport,
  type CsvImportRowOk,
  type PlanImport,
  type TypeLocalPourImport,
} from './csv-import'

const arbre: ArbreExistant = {
  batiments: [{ id: 'b1', nom: 'Tour A' }],
  niveaux: [{ id: 'n1', nom: 'RDC', batiment_id: 'b1' }],
  locaux: [{ id: 'l1', nom: 'Hall', niveau_id: 'n1' }],
}
const types = [
  { id: 1, libelle: 'Bureau' },
  { id: 2, libelle: 'Circulation' },
]
const racine: ContexteImport = { batiment: null, niveau: null }
const ENTETE =
  'Bâtiment;Niveau;Ordre du niveau;Local;Type de local;Surface (m²);Chauffé/climatisé;Description'
const ENTETE_COMPLET = `${ENTETE};Hauteur sous plafond (m);Effectif admissible;Accessible PMR`
/** Dernière phrase du prompt : les données brutes se collent juste après. */
const INVITATION =
  'Voici les données brutes à convertir (colle-les à la suite de ce message) :'

const ok = (lignes: ReturnType<typeof parseImportCsv>['lignes']) =>
  lignes.filter((l): l is CsvImportRowOk => l.ok)
const erreurs = (lignes: ReturnType<typeof parseImportCsv>['lignes']) =>
  lignes.flatMap((l) => (l.ok ? [] : l.erreurs))

describe('parseImportCsv (localisations)', () => {
  it('résout un local complet et convertit les valeurs', () => {
    const r = parseImportCsv(
      `${ENTETE}\nTour A;RDC;0;Accueil;bureau;12,5;Oui;Face entrée`,
      arbre,
      types,
      racine,
    )
    expect(r.colonnesManquantes).toEqual([])
    const [l] = ok(r.lignes)
    expect(l).toMatchObject({
      batiment: 'Tour A',
      niveau: 'RDC',
      local: 'Accueil',
      ordre: 0,
      typeLocalId: 1,
      surface: 12.5,
      chauffe: true,
      description: 'Face entrée',
      chemin: 'Tour A › RDC › Accueil',
    })
  })

  it('lit hauteur, effectif et PMR, et les refuse hors local', () => {
    const r = parseImportCsv(
      `${ENTETE_COMPLET}\nTour A;RDC;;Salle;;;;;2,7;30;Oui\nTour A;RDC;;Cave;;;;;0;2,5;Peut-être\nTour A;R+1;;;;;;;2,7;;`,
      arbre,
      types,
      racine,
    )
    expect(ok(r.lignes)[0]).toMatchObject({
      hauteur: 2.7,
      capacite: 30,
      pmr: true,
    })
    const e = erreurs(r.lignes)
    expect(e).toHaveLength(4)
    expect(e[0]).toContain('Hauteur sous plafond')
    expect(e[1]).toContain('Effectif admissible')
    expect(e[2]).toContain('Accessible PMR')
    expect(e[3]).toBe("Hauteur sous plafond (m) ne s'applique qu'à un local.")
  })

  it('exige la colonne Bâtiment hors contexte', () => {
    const r = parseImportCsv('Niveau;Local\nRDC;Hall', arbre, types, racine)
    expect(r.colonnesManquantes).toEqual(['Bâtiment'])
    expect(r.lignes).toEqual([])
  })

  it('pré-remplit bâtiment et niveau depuis le palier ouvert', () => {
    const contexte: ContexteImport = {
      batiment: { id: 'b1', nom: 'Tour A' },
      niveau: { id: 'n1', nom: 'RDC' },
    }
    const r = parseImportCsv('Local\nSalle 1\nSalle 2', arbre, types, contexte)
    expect(r.colonnesManquantes).toEqual([])
    expect(ok(r.lignes).map((l) => l.chemin)).toEqual([
      'Tour A › RDC › Salle 1',
      'Tour A › RDC › Salle 2',
    ])
  })

  it('refuse un local sans niveau et les colonnes de local sur un niveau', () => {
    const r = parseImportCsv(
      `${ENTETE}\nTour A;;;Cave;;;;\nTour A;R+1;;;Bureau;10;;`,
      arbre,
      types,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      'Un local doit être rattaché à un niveau (Niveau).',
      "Type de local, Surface (m²) ne s'appliquent qu'à un local.",
    ])
  })

  it('rejette un type inconnu, une surface négative et un oui/non invalide', () => {
    const r = parseImportCsv(
      `${ENTETE}\nTour A;RDC;;Salle;Garage;-3;Peut-être;`,
      arbre,
      types,
      racine,
    )
    const e = erreurs(r.lignes)
    expect(e).toHaveLength(3)
    expect(e[0]).toContain('Garage')
    expect(e[1]).toContain('-3')
    expect(e[2]).toContain('Peut-être')
  })

  it('signale les doublons en base et dans le CSV (insensible à la casse)', () => {
    const r = parseImportCsv(
      `${ENTETE}\nTour A;RDC;;hall;;;;\ntour a;;;;;;;\nTour A;RDC;;Salle;;;;\nTour A;rdc;;SALLE;;;;\nTour B;;;;;;;\nTour B;;;;;;;`,
      arbre,
      types,
      racine,
    )
    expect(r.lignes.map((l) => l.ok)).toEqual([
      false,
      false,
      true,
      false,
      true,
      false,
    ])
    expect(erreurs(r.lignes)).toEqual([
      'Le local « hall » existe déjà dans « Tour A › RDC ».',
      'Le bâtiment « tour a » existe déjà — rien à créer sur cette ligne.',
      'Le local « SALLE » existe déjà dans « Tour A › rdc ».',
      'Le bâtiment « Tour B » existe déjà — rien à créer sur cette ligne.',
    ])
  })
})

describe('parseImportCsv (localisations) — en-tête et cellules', () => {
  it('ne réclame aucune colonne quand rien n’a été collé', () => {
    // ORACLE : « colonnes manquantes » accuse l'EN-TÊTE. Sans collage, il n'y
    // a pas d'en-tête fautif : le parseur doit rester neutre.
    for (const texte of ['', '   ', '\n\n']) {
      expect(parseImportCsv(texte, arbre, types, racine)).toEqual({
        colonnesManquantes: [],
        lignes: [],
      })
    }
  })

  it('tolère casse et blancs dans l’en-tête, et lit « absent » comme « vide »', () => {
    // ORACLE : seule la colonne Bâtiment est structurante. Toutes les autres
    // colonnes ABSENTES valent « non renseigné » — jamais une valeur inventée,
    // qui déclencherait des erreurs de surface ou de type sur un CSV minimal.
    const r = parseImportCsv(
      '  bâtiment ; NIVEAU ; local \nTour B;RDC;Salle',
      arbre,
      types,
      racine,
    )
    expect(r.colonnesManquantes).toEqual([])
    expect(r.lignes[0]).toEqual({
      ok: true,
      ligne: 2,
      batiment: 'Tour B',
      niveau: 'RDC',
      local: 'Salle',
      ordre: undefined,
      typeLocalId: undefined,
      surface: undefined,
      chauffe: undefined,
      hauteur: undefined,
      capacite: undefined,
      pmr: undefined,
      champs: [],
      description: undefined,
      chemin: 'Tour B › RDC › Salle',
    })
  })

  it('traite une cellule ABSENTE en fin de ligne comme une cellule vide', () => {
    // ORACLE : l'IA tronque volontiers les lignes dont la fin est vide. Une
    // ligne de niveau écrite « Tour B;R+1 » ne doit pas se voir attribuer un
    // local fabriqué à partir d'une colonne manquante.
    const r = parseImportCsv(`${ENTETE}\nTour B;R+1`, arbre, types, racine)
    expect(r.lignes[0]).toMatchObject({
      ok: true,
      batiment: 'Tour B',
      niveau: 'R+1',
      local: null,
      chemin: 'Tour B › R+1',
    })
  })

  it('numérote les lignes en comptant l’en-tête comme ligne 1', () => {
    // ORACLE : le numéro rapporté sert à retrouver la ligne dans le collage.
    const r = parseImportCsv(
      `${ENTETE}\nTour B;;;;;;;\n;;;;;;;\nTour C;;;;;;;`,
      arbre,
      types,
      racine,
    )
    expect(r.lignes.map((l) => l.ligne)).toEqual([2, 3, 4])
  })

  it('trime chaque cellule avant de la valider', () => {
    // ORACLE : les blancs de mise en forme ne sont pas des données ; ils ne
    // doivent ni entrer en base, ni empêcher un rapprochement de nom.
    const r = parseImportCsv(
      `${ENTETE}\n  Tour B  ;  RDC  ;  0  ;  Salle  ;  Bureau  ;  12,5  ;  Oui  ;  Face entrée  `,
      arbre,
      types,
      racine,
    )
    expect(r.lignes[0]).toMatchObject({
      ok: true,
      batiment: 'Tour B',
      niveau: 'RDC',
      local: 'Salle',
      ordre: 0,
      typeLocalId: 1,
      surface: 12.5,
      chauffe: true,
      description: 'Face entrée',
      chemin: 'Tour B › RDC › Salle',
    })
  })

  it('construit le chemin du palier réellement décrit par la ligne', () => {
    // ORACLE : le chemin sert d'aperçu à l'utilisateur ; une ligne de
    // bâtiment ou de niveau ne doit pas afficher de séparateur orphelin.
    const r = parseImportCsv(
      `${ENTETE}\nTour B;;;;;;;\nTour B;R+1;;;;;;`,
      arbre,
      types,
      racine,
    )
    expect(ok(r.lignes).map((l) => l.chemin)).toEqual([
      'Tour B',
      'Tour B › R+1',
    ])
  })
})

describe('parseImportCsv (localisations) — valeurs typées', () => {
  it('lit « Non » comme un refus explicite, pas comme une absence', () => {
    // ORACLE : « Non » est une information saisie par l'utilisateur ; la
    // confondre avec une cellule vide reviendrait à perdre le fait qu'un local
    // a été déclaré NON chauffé et NON accessible.
    const r = parseImportCsv(
      `${ENTETE_COMPLET}\nTour B;RDC;;Salle;;;Non;;;;Non`,
      arbre,
      types,
      racine,
    )
    expect(ok(r.lignes)[0]).toMatchObject({ chauffe: false, pmr: false })
  })

  it('accepte 0 en surface et en effectif, mais refuse une hauteur nulle', () => {
    // ORACLE : une surface ou un effectif inconnu se saisit « 0 » sans
    // mentir ; une hauteur sous plafond de 0 m décrit un local impossible et
    // doit être corrigée — d'où le traitement explicite de 0 dans le code.
    const r = parseImportCsv(
      [
        ENTETE_COMPLET,
        'Tour B;RDC;;S1;;0;;;;0;',
        'Tour B;RDC;;S2;;;;;0;;',
        'Tour B;RDC;;S3;;;;;abc;;',
        'Tour B;RDC;;S4;;;;;;-1;',
      ].join('\n'),
      arbre,
      types,
      racine,
    )
    expect(r.lignes[0]).toMatchObject({
      ok: true,
      surface: 0,
      capacite: 0,
      hauteur: undefined,
    })
    expect(erreurs(r.lignes)).toEqual([
      "Hauteur sous plafond (m) : « 0 » n'est pas un nombre positif.",
      "Hauteur sous plafond (m) : « abc » n'est pas un nombre positif.",
      "Effectif admissible : « -1 » n'est pas un entier positif.",
    ])
  })

  it('trie les niveaux sur un entier signé, et refuse le reste', () => {
    // ORACLE : le sous-sol se trie en négatif (SS = -1, RDC = 0) : l'entier
    // doit pouvoir être négatif, mais jamais décimal. Et un ordre sans niveau
    // ne trie rien : c'est une erreur, pas une valeur ignorée en silence.
    const r = parseImportCsv(
      [
        ENTETE,
        'Tour B;Sous-sol;-1;;;;;',
        'Tour B;R+1;1,5;;;;;',
        'Tour C;;2;;;;;',
      ].join('\n'),
      arbre,
      types,
      racine,
    )
    expect(ok(r.lignes)[0]).toMatchObject({ niveau: 'Sous-sol', ordre: -1 })
    expect(erreurs(r.lignes)).toEqual([
      "Ordre du niveau : « 1,5 » n'est pas un entier.",
      "Ordre du niveau ne s'applique qu'à un niveau.",
    ])
  })

  it('exige le bâtiment et nomme TOUTES les colonnes de local mal placées', () => {
    // ORACLE : une ligne sans bâtiment ne se rattache à rien. Et sur une ligne
    // de niveau, chaque colonne réservée aux locaux doit être citée pour que
    // l'utilisateur vide les bonnes cellules d'un coup — le verbe s'accorde.
    const r = parseImportCsv(
      [
        ENTETE_COMPLET,
        ';RDC;;Salle;;;;;;;',
        'Tour B;RDC;;;;;Oui;;;;',
        'Tour B;RDC;;;Bureau;10;Oui;;2,7;30;Oui',
      ].join('\n'),
      arbre,
      types,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      'Bâtiment est obligatoire.',
      "Chauffé/climatisé ne s'applique qu'à un local.",
      "Type de local, Surface (m²), Chauffé/climatisé, Hauteur sous plafond (m), Effectif admissible, Accessible PMR ne s'appliquent qu'à un local.",
    ])
  })

  it('énumère les types autorisés quand le type est inconnu', () => {
    // ORACLE : un type refusé doit rendre la correction évidente — la liste
    // exacte des libellés attendus, pas un simple « valeur invalide ».
    const r = parseImportCsv(
      `${ENTETE}\nTour B;RDC;;Salle;Garage;;;`,
      arbre,
      types,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      "Type de local : « Garage » n'est pas une valeur autorisée (Bureau, Circulation).",
    ])
  })
})

describe('parseImportCsv (localisations) — rapprochement avec l’existant', () => {
  it('refuse de recréer un niveau déjà en base ou déjà créé plus haut', () => {
    // ORACLE : une ligne qui ne créerait rien est une ligne à corriger. Sans
    // ce contrôle, la modale enverrait un INSERT que l'index UNIQUE rejette.
    const r = parseImportCsv(
      [ENTETE, 'Tour A;RDC;;;;;;', 'Tour B;R+1;;;;;;', 'Tour B;R+1;;;;;;'].join(
        '\n',
      ),
      arbre,
      types,
      racine,
    )
    expect(r.lignes.map((l) => l.ok)).toEqual([false, true, false])
    expect(erreurs(r.lignes)).toEqual([
      'Le niveau « RDC » existe déjà dans « Tour A » — rien à créer sur cette ligne.',
      'Le niveau « R+1 » existe déjà dans « Tour B » — rien à créer sur cette ligne.',
    ])
  })

  it('reconnaît un lieu enregistré avec des blancs parasites', () => {
    // ORACLE : des blancs autour d'un nom en base désignent le MÊME lieu —
    // sans ce recadrage, l'import le recrée en double.
    const r = parseImportCsv(
      `${ENTETE}\nTour A;RDC;;Hall;;;;`,
      {
        batiments: [{ id: 'b1', nom: '  Tour A  ' }],
        niveaux: [{ id: 'n1', nom: '  RDC  ', batiment_id: 'b1' }],
        locaux: [{ id: 'l1', nom: '  Hall  ', niveau_id: 'n1' }],
      },
      types,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      'Le local « Hall » existe déjà dans « Tour A › RDC ».',
    ])
  })

  it('ne confond pas « TourA › RDC » avec « Tour › ARDC »', () => {
    // ORACLE : les chemins sont comparés par concaténation ; sans séparateur,
    // deux lieux distincts se retrouveraient identiques et le second serait
    // refusé comme « déjà existant » alors qu'il reste à créer.
    const r = parseImportCsv(
      `${ENTETE}\nTour;ARDC;;;;;;`,
      {
        batiments: [{ id: 'b1', nom: 'TourA' }],
        niveaux: [{ id: 'n1', nom: 'RDC', batiment_id: 'b1' }],
        locaux: [],
      },
      types,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([])
    expect(ok(r.lignes)[0]).toMatchObject({ batiment: 'Tour', niveau: 'ARDC' })
  })

  it('ne trébuche pas sur un arbre dont un rattachement manque', () => {
    // ORACLE : l'arbre vient de la base ; un niveau ou un local dont le parent
    // n'est pas dans le lot chargé ne doit pas faire échouer tout l'import.
    const r = parseImportCsv(
      `${ENTETE}\nTour B;RDC;;Salle;;;;`,
      {
        batiments: [{ id: 'b1', nom: 'Tour A' }],
        niveaux: [
          { id: 'n1', nom: 'RDC', batiment_id: 'b1' },
          { id: 'n9', nom: 'Perdu', batiment_id: 'bX' },
        ],
        locaux: [
          { id: 'l1', nom: 'Hall', niveau_id: 'n1' },
          { id: 'l9', nom: 'Orphelin', niveau_id: 'nX' },
        ],
      },
      types,
      racine,
    )
    expect(r.lignes[0]?.ok).toBe(true)
  })

  it('ne cumule pas « existe déjà » avec une erreur de saisie', () => {
    // ORACLE : une ligne déjà fautive n'a pas à recevoir un second reproche
    // portant sur des données qu'on n'a pas su lire. Une cause, un message.
    const r = parseImportCsv(
      `${ENTETE}\nTour A;RDC;;Hall;Garage;;;`,
      arbre,
      types,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      "Type de local : « Garage » n'est pas une valeur autorisée (Bureau, Circulation).",
    ])
  })
})

describe('parseImportCsv (localisations) — palier ouvert', () => {
  const contexte: ContexteImport = {
    batiment: { id: 'b1', nom: 'Tour A' },
    niveau: { id: 'n1', nom: 'RDC' },
  }

  it('n’impose le palier ouvert qu’aux lignes qui le laissent vide', () => {
    // ORACLE : le contexte COMPLÈTE, il ne corrige pas. Une ligne qui nomme un
    // autre bâtiment décrit un autre bâtiment ; lui greffer le niveau du
    // palier ouvert rattacherait le local au mauvais endroit.
    const r = parseImportCsv(
      'Bâtiment;Niveau;Local\n;;Salle 9\nTour B;;Salle 8',
      arbre,
      types,
      contexte,
    )
    expect(ok(r.lignes)[0]).toMatchObject({
      batiment: 'Tour A',
      niveau: 'RDC',
      local: 'Salle 9',
    })
    expect(erreurs(r.lignes)).toEqual([
      'Un local doit être rattaché à un niveau (Niveau).',
    ])
  })

  it('ne remplace jamais un niveau EXPLICITEMENT nommé', () => {
    // ORACLE : le contexte ne sert qu'à remplir un vide. Écraser un niveau
    // écrit noir sur blanc déplacerait les locaux d'un étage à l'autre — la
    // pire des erreurs, car l'import « réussit » sans rien signaler.
    const r = parseImportCsv(
      'Bâtiment;Niveau;Local\nTour A;R+1;Salle 7',
      arbre,
      types,
      contexte,
    )
    expect(ok(r.lignes)[0]).toMatchObject({
      batiment: 'Tour A',
      niveau: 'R+1',
      chemin: 'Tour A › R+1 › Salle 7',
    })
  })
})

describe('caractéristiques par type (112)', () => {
  const typesAvecChamps = [
    {
      id: 1,
      libelle: 'Bureau',
      champs: [
        {
          cle: 'Postes',
          type: 'nombre' as const,
          requis: true,
          defaut: null,
        },
      ],
    },
    {
      id: 2,
      libelle: 'Circulation',
      champs: [
        {
          cle: 'Issue de secours',
          type: 'oui-non' as const,
          requis: false,
          defaut: null,
        },
      ],
    },
  ]
  const ENTETE_CARACT = `${ENTETE};Postes;Issue de secours`

  it('résout la caractéristique du type de la ligne', () => {
    const r = parseImportCsv(
      `${ENTETE_CARACT}\nTour A;RDC;;Salle A;Bureau;;;;4;`,
      arbre,
      typesAvecChamps,
      racine,
    )
    expect(ok(r.lignes)[0]?.champs).toEqual([
      { cle: 'Postes', type: 'nombre', requis: true, defaut: null, valeur: 4 },
    ])
  })

  it('refuse une caractéristique qui n’appartient pas au type de la ligne', () => {
    const r = parseImportCsv(
      `${ENTETE_CARACT}\nTour A;RDC;;Salle B;Circulation;;;;4;Oui`,
      arbre,
      typesAvecChamps,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      '« Postes » ne fait pas partie des caractéristiques du type « Circulation ».',
    ])
  })

  it('exige une caractéristique obligatoire du type', () => {
    const r = parseImportCsv(
      `${ENTETE_CARACT}\nTour A;RDC;;Salle C;Bureau;;;;;`,
      arbre,
      typesAvecChamps,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual(['« Postes » est obligatoire.'])
  })

  it('refuse une caractéristique renseignée sans Type de local', () => {
    // ORACLE : sans type, aucune caractéristique n'a de gabarit — la valeur
    // serait avalée en silence. Le message dit la CAUSE (le type manque),
    // pas seulement que la colonne est de trop.
    const r = parseImportCsv(
      `${ENTETE_CARACT}\nTour A;RDC;;Salle D;;;;;4;`,
      arbre,
      typesAvecChamps,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      "« Postes » ne peut être renseigné que si Type de local l'est.",
    ])
  })

  it('cite la colonne sans les blancs de mise en forme de l’en-tête', () => {
    // ORACLE : le message nomme la colonne fautive pour que l'utilisateur la
    // retrouve. Les espaces qui entourent l'en-tête sont de la mise en forme :
    // les recracher dans le message ne ferait qu'ajouter du bruit.
    const r = parseImportCsv(
      'Bâtiment;Niveau;Local;Type de local;  Postes  \nTour A;RDC;Salle G;;4',
      arbre,
      typesAvecChamps,
      racine,
    )
    expect(erreurs(r.lignes)).toEqual([
      "« Postes » ne peut être renseigné que si Type de local l'est.",
    ])
  })

  it('applique le défaut du gabarit quand la colonne manque au CSV', () => {
    // ORACLE : une caractéristique FACULTATIVE dont la colonne n'a pas été
    // générée n'est pas une erreur : le local est créé avec la valeur par
    // défaut du type, jamais avec du texte fabriqué.
    const optionnel = [
      {
        id: 1,
        libelle: 'Bureau',
        champs: [
          {
            cle: 'Postes',
            type: 'nombre' as const,
            requis: false,
            defaut: null,
          },
        ],
      },
    ]
    const r = parseImportCsv(
      `${ENTETE}\nTour A;RDC;;Salle E;Bureau;;;`,
      arbre,
      optionnel,
      racine,
    )
    expect(ok(r.lignes)[0]?.champs).toEqual([
      {
        cle: 'Postes',
        type: 'nombre',
        requis: false,
        defaut: null,
        valeur: null,
      },
    ])
  })

  it('lit une colonne de caractéristique où qu’elle se trouve', () => {
    // ORACLE : les colonnes sont adressées par leur nom, pas par leur rang.
    // Une caractéristique placée en 2e position doit être lue comme une autre.
    const r = parseImportCsv(
      'Bâtiment;Postes;Niveau;Local;Type de local\nTour A;4;RDC;Salle F;Bureau',
      arbre,
      typesAvecChamps,
      racine,
    )
    expect(ok(r.lignes)[0]?.champs).toEqual([
      { cle: 'Postes', type: 'nombre', requis: true, defaut: null, valeur: 4 },
    ])
  })

  it('décrit les caractéristiques de chaque type dans le prompt', () => {
    const p = buildImportPrompt({
      arbre,
      types: typesAvecChamps,
      contexte: racine,
    })
    expect(p).toContain('Postes ; Issue de secours')
    expect(p).toContain('- Type « Bureau » :')
    expect(p).toContain('obligatoire pour ce type.')
  })
})

describe('construirePlan', () => {
  it('regroupe par bâtiment/niveau, réutilise l’existant et compte les créations', () => {
    const r = parseImportCsv(
      `${ENTETE}\nTour A;RDC;;Salle;;;;\nTour A;R+1;1;Bureau 101;Bureau;15;Oui;\nTour A;R+1;;Bureau 102;;;;\nTour B;;;;;;;Annexe\nTour B;Sous-sol;-1;;;;;Parking`,
      arbre,
      types,
      racine,
    )
    const plan = construirePlan(ok(r.lignes), arbre)
    expect(plan.nbBatiments).toBe(1)
    expect(plan.nbNiveaux).toBe(2)
    expect(plan.nbLocaux).toBe(3)
    expect(plan.batiments).toEqual([
      {
        nom: 'Tour A',
        existantId: 'b1',
        niveaux: [
          {
            nom: 'RDC',
            existantId: 'n1',
            locaux: [
              {
                nom: 'Salle',
                typeLocalId: undefined,
                surface: undefined,
                chauffe: false,
                champs: [],
                hauteur: undefined,
                capacite: undefined,
                pmr: false,
                description: undefined,
              },
            ],
          },
          {
            nom: 'R+1',
            existantId: null,
            ordre: 1,
            locaux: [
              {
                nom: 'Bureau 101',
                typeLocalId: 1,
                surface: 15,
                chauffe: true,
                champs: [],
                hauteur: undefined,
                capacite: undefined,
                pmr: false,
                description: undefined,
              },
              {
                nom: 'Bureau 102',
                typeLocalId: undefined,
                surface: undefined,
                chauffe: false,
                champs: [],
                hauteur: undefined,
                capacite: undefined,
                pmr: false,
                description: undefined,
              },
            ],
          },
        ],
      },
      {
        nom: 'Tour B',
        existantId: null,
        description: 'Annexe',
        niveaux: [
          {
            nom: 'Sous-sol',
            existantId: null,
            ordre: -1,
            description: 'Parking',
            locaux: [],
          },
        ],
      },
    ])
    expect(resumePlan(plan)).toBe('1 bâtiment, 2 niveaux et 3 locaux')
  })
})

describe('construirePlan — écritures conditionnelles', () => {
  const vide: ArbreExistant = { batiments: [], niveaux: [], locaux: [] }
  const ligne = (over: Partial<CsvImportRowOk>): CsvImportRowOk => ({
    ok: true,
    ligne: 2,
    batiment: 'Tour B',
    niveau: null,
    local: null,
    champs: [],
    chemin: 'Tour B',
    ...over,
  })

  it('n’écrit pas de description sur un lieu dont la ligne n’en porte pas', () => {
    // ORACLE : le plan est appliqué tel quel en base. Poser une description
    // `undefined` sur un bâtiment ou un niveau DÉJÀ existant effacerait celle
    // qui s'y trouve ; une propriété non posée, elle, ne touche à rien. Il
    // faut donc des lignes de BÂTIMENT SEUL et de NIVEAU SEUL — ce sont elles
    // qui décrivent ces deux paliers.
    const plan = construirePlan(
      [
        ligne({}),
        ligne({ niveau: 'R+1', chemin: 'Tour B › R+1' }),
        ligne({ niveau: 'R+1', local: 'A', chemin: 'Tour B › R+1 › A' }),
      ],
      vide,
    )
    const b = plan.batiments[0]
    expect(b).toBeDefined()
    expect(Object.hasOwn(b!, 'description')).toBe(false)
    const n = b?.niveaux[0]
    expect(n).toBeDefined()
    expect(Object.hasOwn(n!, 'description')).toBe(false)
    expect(Object.hasOwn(n!, 'ordre')).toBe(false)
    expect(n?.locaux.map((l) => l.nom)).toEqual(['A'])
  })

  it('garde le PREMIER ordre rencontré pour un niveau', () => {
    // ORACLE : l'ordre est une propriété du niveau, répétée sur ses lignes de
    // locaux. La dernière ligne ne doit pas réécrire ce que la première a dit.
    const plan = construirePlan(
      [
        ligne({ niveau: 'R+1', local: 'A', ordre: 1 }),
        ligne({ niveau: 'R+1', local: 'B', ordre: 5 }),
      ],
      vide,
    )
    expect(plan.batiments[0]?.niveaux[0]?.ordre).toBe(1)
  })

  it('ne réutilise un niveau existant que sous SON bâtiment', () => {
    // ORACLE : deux bâtiments ont chacun leur « RDC ». Rattacher le niveau
    // d'un autre bâtiment y déverserait les locaux importés.
    const plan = construirePlan(
      [
        ligne({
          batiment: 'Tour A',
          niveau: 'RDC',
          local: 'Salle',
          chemin: 'Tour A › RDC › Salle',
        }),
      ],
      {
        batiments: [{ id: 'b1', nom: 'Tour A' }],
        niveaux: [{ id: 'n9', nom: 'RDC', batiment_id: 'bX' }],
        locaux: [],
      },
    )
    expect(plan.batiments[0]?.niveaux[0]?.existantId).toBeNull()
  })

  it('ne compte que les bâtiments à CRÉER', () => {
    // ORACLE : le compteur annonce un travail d'écriture ; y inclure les
    // bâtiments déjà là (ou n'y mettre qu'eux) ferait mentir le résumé.
    const plan = construirePlan(
      [
        ligne({ batiment: 'Tour A' }),
        ligne({ batiment: 'Tour B' }),
        ligne({ batiment: 'Tour C' }),
      ],
      { batiments: [{ id: 'b1', nom: 'Tour A' }], niveaux: [], locaux: [] },
    )
    expect(plan.nbBatiments).toBe(2)
  })
})

describe('resumePlan (localisations)', () => {
  const plan = (
    nbBatiments: number,
    nbNiveaux: number,
    nbLocaux: number,
  ): PlanImport => ({ batiments: [], nbBatiments, nbNiveaux, nbLocaux })

  // ORACLE : phrase française destinée au bouton de confirmation. Règles :
  // un compteur nul ne s'écrit pas (annoncer « 0 bâtiment » ferait croire à
  // une erreur), le pluriel suit le nombre (« niveaux », « locaux »), et les
  // morceaux se séparent par des virgules sauf le dernier, introduit par « et ».
  it.each([
    [plan(0, 0, 0), ''],
    [plan(1, 0, 0), '1 bâtiment'],
    [plan(2, 0, 0), '2 bâtiments'],
    [plan(0, 1, 0), '1 niveau'],
    [plan(0, 3, 0), '3 niveaux'],
    [plan(0, 0, 1), '1 local'],
    [plan(0, 0, 4), '4 locaux'],
    [plan(1, 1, 0), '1 bâtiment et 1 niveau'],
    [plan(0, 1, 2), '1 niveau et 2 locaux'],
    [plan(1, 2, 3), '1 bâtiment, 2 niveaux et 3 locaux'],
  ])('résume %o en « %s »', (p, attendu) => {
    expect(resumePlan(p)).toBe(attendu)
  })
})

describe('buildImportPrompt', () => {
  it('liste l’arbre existant, les types et le contexte du palier', () => {
    const p = buildImportPrompt({
      arbre,
      types,
      contexte: { batiment: { id: 'b1', nom: 'Tour A' }, niveau: null },
    })
    expect(p).toContain('appartiennent au bâtiment « Tour A »')
    expect(p).toContain('« Bureau », « Circulation »')
    expect(p).toContain('- Tour A\n  - RDC\n    - Hall')
  })

  it('énonce toutes les règles de format que le parseur suppose', () => {
    // ORACLE : le prompt est le CONTRAT passé à l'IA. Chaque règle correspond
    // à une hypothèse du parseur (séparateur, en-tête unique, une ligne par
    // élément, parents créés implicitement, aucune phrase parasite).
    const lignes = buildImportPrompt({ arbre, types, contexte: racine }).split(
      '\n',
    )
    for (const regle of [
      'Format EXACT attendu :',
      '- Séparateur de colonnes : point-virgule ( ; )',
      '- Encodage : UTF-8',
      "- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre, puis une ligne par élément.",
      "- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).",
      'Colonnes :',
      "Chaque ligne = UN élément (un local le plus souvent). Un bâtiment ou un niveau mentionné sur une ligne de local est créé automatiquement s'il n'existe pas : inutile de lui consacrer une ligne à part. Réserve les lignes sans Local aux niveaux vides, et les lignes sans Niveau ni Local aux bâtiments vides.",
    ]) {
      expect(lignes).toContain(regle)
    }
  })

  it('décrit CHAQUE colonne lue par le parseur, avec sa contrainte', () => {
    // ORACLE : propriété de BOUCLE prompt ↔ parseur. Toute colonne que
    // `parseImportCsv` sait lire doit être annoncée avec la règle que le
    // parseur fait respecter (virgule décimale, « Oui »/« Non », entier signé),
    // sinon l'utilisateur récolte des erreurs qu'aucune consigne n'annonçait.
    const lignes = buildImportPrompt({ arbre, types, contexte: racine }).split(
      '\n',
    )
    const puce = (colonne: string) =>
      lignes.find((l) => l.startsWith(`- ${colonne} — `))
    for (const colonne of [
      'Bâtiment',
      'Niveau',
      'Ordre du niveau',
      'Local',
      'Type de local',
      'Surface (m²)',
      'Chauffé/climatisé',
      'Hauteur sous plafond (m)',
      'Effectif admissible',
      'Accessible PMR',
      'Description',
    ]) {
      expect(puce(colonne)).toBeDefined()
    }
    expect(puce('Niveau')).toContain('Obligatoire si Local est rempli.')
    expect(puce('Ordre du niveau')).toContain(
      'Nombre entier pour trier les niveaux du bas vers le haut',
    )
    expect(puce('Type de local')).toContain('« Bureau », « Circulation »')
    expect(puce('Surface (m²)')).toContain('virgule comme séparateur décimal')
    expect(puce('Chauffé/climatisé')).toContain(
      'Écris exactement « Oui » ou « Non » (vide = Non).',
    )
    expect(puce('Accessible PMR')).toContain('mobilité réduite')
    expect(puce('Effectif admissible')).toContain('Nombre entier')
  })

  it('restreint l’arbre annoncé au palier ouvert', () => {
    // ORACLE : l'arbre sert de VOCABULAIRE à l'IA. Depuis un bâtiment ouvert,
    // lui montrer les autres bâtiments l'invite à y écrire — hors du palier
    // que l'utilisateur a ouvert.
    const arbreDeux: ArbreExistant = {
      batiments: [
        { id: 'b1', nom: 'Tour A' },
        { id: 'b2', nom: 'Tour B' },
      ],
      niveaux: [
        { id: 'n1', nom: 'RDC', batiment_id: 'b1' },
        { id: 'n2', nom: 'R+1', batiment_id: 'b1' },
        { id: 'n3', nom: 'RDC', batiment_id: 'b2' },
      ],
      locaux: [
        { id: 'l1', nom: 'Hall', niveau_id: 'n1' },
        { id: 'l2', nom: 'Bureau 101', niveau_id: 'n2' },
        { id: 'l3', nom: 'Accueil B', niveau_id: 'n3' },
      ],
    }
    const bloc = (p: string) => {
      const l = p.split('\n')
      const i = l.findIndex((x) => x.startsWith('Lieux DÉJÀ enregistrés'))
      return l.slice(i + 1, l.indexOf('', i + 1))
    }
    expect(
      bloc(buildImportPrompt({ arbre: arbreDeux, types, contexte: racine })),
    ).toEqual([
      '- Tour A',
      '  - RDC',
      '    - Hall',
      '  - R+1',
      '    - Bureau 101',
      '- Tour B',
      '  - RDC',
      '    - Accueil B',
    ])
    expect(
      bloc(
        buildImportPrompt({
          arbre: arbreDeux,
          types,
          contexte: { batiment: { id: 'b1', nom: 'Tour A' }, niveau: null },
        }),
      ),
    ).toEqual([
      '- Tour A',
      '  - RDC',
      '    - Hall',
      '  - R+1',
      '    - Bureau 101',
    ])
    expect(
      bloc(
        buildImportPrompt({
          arbre: arbreDeux,
          types,
          contexte: {
            batiment: { id: 'b1', nom: 'Tour A' },
            niveau: { id: 'n2', nom: 'R+1' },
          },
        }),
      ),
    ).toEqual(['- Tour A', '  - R+1', '    - Bureau 101'])
  })

  it('le dit franchement quand il n’y a ni lieu ni type', () => {
    // ORACLE : une liste vide laisserait l'IA inventer des noms de lieux ou de
    // types ; il faut lui dire explicitement de ne rien mettre.
    const p = buildImportPrompt({
      arbre: { batiments: [], niveaux: [], locaux: [] },
      types: [],
      contexte: racine,
    })
    expect(p).toContain('(aucun lieu enregistré pour l’instant)')
    expect(p).toContain('(aucun type disponible : laisse la colonne vide)')
  })

  it('reste un document lisible : paragraphes séparés, invitation en dernier', () => {
    // ORACLE : le prompt est collé dans une IA avec les données brutes À LA
    // SUITE. Sa structure (un paragraphe par idée, une ligne vide entre
    // chacun, une invitation finale suivie d'une ligne vide) est ce qui évite
    // que les données collées se retrouvent soudées au texte d'instruction.
    const lignes = buildImportPrompt({ arbre, types, contexte: racine }).split(
      '\n',
    )
    expect(lignes[0]).toContain(
      'bâtiments → niveaux (étages) → locaux (pièces)',
    )
    expect(lignes[1]).toBe('')
    expect(lignes[2]).toBe('Format EXACT attendu :')
    expect(lignes[lignes.indexOf('Colonnes :') - 1]).toBe('')
    expect(
      lignes[
        lignes.findIndex((l) => l.startsWith('Chaque ligne = UN élément')) - 1
      ],
    ).toBe('')

    const i = lignes.indexOf(INVITATION)
    expect(i).toBeGreaterThan(0)
    expect(lignes[i - 1]).toBe('')
    expect(lignes[i - 2]).toBe('    - Hall') // dernière ligne de l'arbre
    expect(lignes.slice(i + 1)).toEqual([''])

    // Depuis un palier ouvert, la consigne de palier s'intercale en 3e ligne.
    const depuisNiveau = buildImportPrompt({
      arbre,
      types,
      contexte: {
        batiment: { id: 'b1', nom: 'Tour A' },
        niveau: { id: 'n1', nom: 'RDC' },
      },
    }).split('\n')
    expect(depuisNiveau[2]).toBe(
      'Tous les éléments à importer sont des LOCAUX du niveau « RDC » du bâtiment « Tour A » : remplis Bâtiment et Niveau avec exactement ces deux noms sur chaque ligne.',
    )
    expect(depuisNiveau[3]).toBe('')
    expect(depuisNiveau[4]).toBe('Format EXACT attendu :')

    const depuisBatiment = buildImportPrompt({
      arbre,
      types,
      contexte: { batiment: { id: 'b1', nom: 'Tour A' }, niveau: null },
    }).split('\n')
    expect(depuisBatiment[2]).toBe(
      'Tous les éléments à importer appartiennent au bâtiment « Tour A » : remplis Bâtiment avec exactement ce nom sur chaque ligne.',
    )
    expect(depuisBatiment[3]).toBe('')
    expect(depuisBatiment[4]).toBe('Format EXACT attendu :')
  })
})

describe('buildImportPrompt — colonnes de caractéristiques', () => {
  const typesPrompt: TypeLocalPourImport[] = [
    {
      id: 1,
      libelle: 'Bureau',
      champs: [
        { cle: 'Postes', type: 'nombre', requis: true, defaut: null },
        {
          cle: 'Surface utile',
          type: 'nombre',
          unite: 'm²',
          requis: false,
          defaut: null,
        },
        {
          cle: 'Usage',
          type: 'liste',
          options: ['Bureau', 'Salle'],
          requis: false,
          defaut: null,
        },
        { cle: 'Mise en service', type: 'date', requis: false, defaut: null },
        { cle: 'Remarque', type: 'texte', requis: false, defaut: null },
        // Liste sans option déclarée : la phrase reste, la liste est vide.
        { cle: 'Famille', type: 'liste', requis: false, defaut: null },
      ],
    },
    {
      id: 2,
      libelle: 'Circulation',
      champs: [
        {
          cle: 'Issue de secours',
          type: 'oui-non',
          requis: false,
          defaut: null,
        },
      ],
    },
    { id: 3, libelle: 'Local technique' },
  ]

  it('décrit chaque caractéristique selon son type et son caractère obligatoire', () => {
    // ORACLE : la description d'une colonne est la SEULE chose qui dira à
    // l'IA comment écrire la valeur. Elle doit refléter exactement ce que
    // `resoudreValeurTexte` accepte : liste close recopiée à l'identique,
    // virgule décimale sans l'unité, « Oui »/« Non », JJ/MM/AAAA.
    const lignes = buildImportPrompt({
      arbre,
      types: typesPrompt,
      contexte: racine,
    }).split('\n')
    const titre =
      'Colonnes de CARACTÉRISTIQUES (une par caractéristique connue, à la suite des colonnes ci-dessus) : Postes ; Surface utile ; Usage ; Mise en service ; Remarque ; Famille ; Issue de secours.'
    expect(lignes).toContain(titre)
    // Le bloc s'ouvre après une ligne vide, comme toute section du prompt.
    expect(lignes[lignes.indexOf(titre) - 1]).toBe('')
    expect(lignes).toContain(
      "Chaque caractéristique n'appartient qu'à certains types de local : sur une ligne, ne remplis QUE celles de son Type de local, et laisse les autres vides.",
    )
    const i = lignes.indexOf('- Type « Bureau » :')
    expect(i).toBeGreaterThan(0)
    expect(lignes.slice(i + 1, i + 7)).toEqual([
      "  - Postes — obligatoire pour ce type. Un nombre, virgule comme séparateur décimal, sans l'unité dans la cellule.",
      "  - Surface utile — optionnel. Un nombre en m², virgule comme séparateur décimal, sans l'unité dans la cellule.",
      '  - Usage — optionnel. UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : « Bureau », « Salle ».',
      '  - Mise en service — optionnel. Format JJ/MM/AAAA.',
      '  - Remarque — optionnel. Texte libre.',
      '  - Famille — optionnel. UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : .',
    ])
    expect(lignes).toContain('- Type « Circulation » :')
    expect(lignes).toContain(
      '  - Issue de secours — optionnel. Écris exactement « Oui » ou « Non ».',
    )
    // Un type SANS caractéristique n'ouvre pas de section vide.
    expect(lignes).not.toContain('- Type « Local technique » :')
  })

  it('n’ouvre le bloc caractéristiques que si un type en porte', () => {
    // ORACLE : annoncer des colonnes qui n'existent pas ferait produire à
    // l'IA un CSV dont le parseur refusera chaque cellule.
    const lignes = buildImportPrompt({
      arbre,
      types,
      contexte: racine,
    }).split('\n')
    expect(
      lignes.some((l) => l.startsWith('Colonnes de CARACTÉRISTIQUES')),
    ).toBe(false)
    // La liste des colonnes mène directement à l'arbre existant.
    const i = lignes.findIndex((l) => l.startsWith('- Description — '))
    expect(lignes[i + 1]).toBe('')
    expect(lignes[i + 2]?.startsWith('Lieux DÉJÀ enregistrés')).toBe(true)
  })

  it('ne donne qu’UNE colonne à une caractéristique partagée par deux types', () => {
    // ORACLE : une seule colonne par nom de caractéristique, nommée comme la
    // PREMIÈRE définition rencontrée — deux colonnes homonymes dans l'en-tête
    // rendraient la seconde illisible (la recherche par nom prend la première).
    const p = buildImportPrompt({
      arbre,
      types: [
        {
          id: 1,
          libelle: 'A',
          champs: [
            { cle: 'Postes', type: 'texte', requis: false, defaut: null },
          ],
        },
        {
          id: 2,
          libelle: 'B',
          champs: [
            { cle: 'postes', type: 'texte', requis: false, defaut: null },
          ],
        },
      ],
      contexte: racine,
    })
    expect(p).toContain('à la suite des colonnes ci-dessus) : Postes.')
  })
})
