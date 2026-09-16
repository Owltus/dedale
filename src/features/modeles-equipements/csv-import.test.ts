import { describe, expect, it } from 'vitest'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ModeleEquipementCsvRowOk,
  type ModeleEquipementExistant,
  type PlanImportModelesEquipements,
} from './csv-import'

const ENTETE =
  'Modèle;Description du modèle;Caractéristique;Type;Unité;Valeurs possibles;Obligatoire;Valeur par défaut'
/** Dernière phrase du prompt : les données brutes se collent juste après. */
const INVITATION =
  'Voici les données brutes à convertir (colle-les à la suite de ce message) :'

const existants: ModeleEquipementExistant[] = [
  {
    id: 'm1',
    nom: 'Chaudière',
    champs: [{ cle: 'Marque', type: 'texte', requis: false, defaut: null }],
  },
]

const ok = (lignes: ReturnType<typeof parseImportCsv>['lignes']) =>
  lignes.filter((l): l is ModeleEquipementCsvRowOk => l.ok)

describe('parseImportCsv (modèles d’équipements)', () => {
  it('exige les colonnes structurantes', () => {
    const r = parseImportCsv('Nom;Autre\nx;y')
    expect(r.colonnesManquantes).toEqual(['Modèle', 'Caractéristique'])
    expect(r.lignes).toEqual([])
  })

  it('résout les cinq types de caractéristique', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;Pompe de relevage;Marque;Texte;;;Oui;Grundfos',
        'Pompe;;Puissance;Nombre;kW;;;7,5',
        'Pompe;;Mise en service;Date;;;;01/02/2024',
        'Pompe;;Variateur;Oui / Non;;;;Oui',
        'Pompe;;Énergie;Liste;;Gaz|Fioul|Électrique;Oui;Gaz',
      ].join('\n'),
    )
    expect(r.colonnesManquantes).toEqual([])
    const lignes = ok(r.lignes)
    expect(lignes).toHaveLength(5)
    expect(lignes[0]?.champ).toMatchObject({
      cle: 'Marque',
      type: 'texte',
      requis: true,
      defaut: 'Grundfos',
    })
    expect(lignes[1]?.champ).toMatchObject({
      type: 'nombre',
      unite: 'kW',
      defaut: 7.5,
    })
    // Date convertie en ISO, comme partout ailleurs dans l'application.
    expect(lignes[2]?.champ?.defaut).toBe('2024-02-01')
    expect(lignes[3]?.champ?.defaut).toBe(true)
    expect(lignes[4]?.champ).toMatchObject({
      type: 'liste',
      options: ['Gaz', 'Fioul', 'Électrique'],
      defaut: 'Gaz',
    })
  })

  it('accepte un modèle sans caractéristique et refuse les colonnes orphelines', () => {
    const r = parseImportCsv(
      [ENTETE, 'Ballon;Ballon tampon;;;;;;', 'Vase;;;Nombre;;;;'].join('\n'),
    )
    expect(ok(r.lignes)).toHaveLength(1)
    expect(ok(r.lignes)[0]?.champ).toBeNull()
    const ko = r.lignes.find((l) => !l.ok)
    expect(ko?.ok).toBe(false)
    if (ko?.ok === false)
      expect(ko.erreurs.join(' ')).toContain('Caractéristique')
  })

  it('refuse une liste sans valeurs, une unité hors nombre et un défaut incohérent', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;;Énergie;Liste;;;;',
        'Pompe;;Marque;Texte;kW;;;',
        'Pompe;;Débit;Nombre;;;;beaucoup',
      ].join('\n'),
    )
    const messages = r.lignes.flatMap((l) => (l.ok ? [] : l.erreurs)).join(' ')
    expect(messages).toContain('Valeurs possibles est obligatoire')
    expect(messages).toContain("Unité ne s'applique qu'au type")
    expect(messages).toContain("n'est pas un nombre")
  })

  it('ignore une caractéristique déjà définie sur un modèle existant', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Chaudière;;Marque;Texte;;;;',
        'Chaudière;;Puissance;Nombre;kW;;;',
      ].join('\n'),
      existants,
    )
    const [ignoree] = r.lignes
    expect(ignoree?.ok).toBe(false)
    if (ignoree && !ignoree.ok) expect(ignoree.ignoree).toBe(true)
    expect(ok(r.lignes)).toHaveLength(1)
  })

  it('ignore une caractéristique répétée dans le CSV lui-même', () => {
    const r = parseImportCsv(
      [ENTETE, 'Pompe;;Marque;Texte;;;;', 'Pompe;;marque;Texte;;;;'].join('\n'),
    )
    expect(ok(r.lignes)).toHaveLength(1)
    expect(r.lignes[1]?.ok === false && r.lignes[1].ignoree).toBe(true)
  })
})

describe('construirePlan (modèles d’équipements)', () => {
  it('crée les nouveaux modèles et complète les existants sans les écraser', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Chaudière;;Puissance;Nombre;kW;;;',
        'Pompe;Pompe de relevage;Marque;Texte;;;;',
        'Pompe;;Débit;Nombre;m³/h;;;',
      ].join('\n'),
      existants,
    )
    const plan = construirePlan(ok(r.lignes), existants)
    expect(plan.nbCreations).toBe(1)
    expect(plan.nbCompletions).toBe(1)
    expect(plan.nbCaracteristiques).toBe(3)

    const chaudiere = plan.modeles.find((m) => m.nom === 'Chaudière')
    expect(chaudiere?.existantId).toBe('m1')
    // Les caractéristiques déjà en base sont conservées EN TÊTE, intactes.
    expect(chaudiere?.champsExistants.map((c) => c.cle)).toEqual(['Marque'])
    expect(chaudiere?.champsAjoutes.map((c) => c.cle)).toEqual(['Puissance'])

    const pompe = plan.modeles.find((m) => m.nom === 'Pompe')
    expect(pompe?.existantId).toBeNull()
    expect(pompe?.description).toBe('Pompe de relevage')
    expect(resumePlan(plan)).toContain('1 modèle à créer')
  })
})

describe('parseImportCsv (modèles d’équipements) — en-tête et lignes irrégulières', () => {
  it('ne réclame aucune colonne quand rien n’a été collé', () => {
    // ORACLE : « colonnes manquantes » accuse l'EN-TÊTE. Sans collage, il n'y
    // a pas d'en-tête fautif : le parseur doit rester neutre.
    for (const texte of ['', '   ', '\n\n']) {
      expect(parseImportCsv(texte)).toEqual({
        colonnesManquantes: [],
        lignes: [],
      })
    }
  })

  it('ne réclame que la colonne structurante réellement absente', () => {
    expect(
      parseImportCsv('Modèle;Type\nPompe;Texte').colonnesManquantes,
    ).toEqual(['Caractéristique'])
    expect(
      parseImportCsv('Caractéristique;Type\nMarque;Texte').colonnesManquantes,
    ).toEqual(['Modèle'])
  })

  it('se contente des deux colonnes structurantes, casse et blancs compris', () => {
    // ORACLE : seules Modèle et Caractéristique sont exigées. Une colonne
    // ABSENTE de l'en-tête vaut « vide partout », jamais une valeur inventée :
    // sinon un CSV minimal déclencherait des erreurs d'unité ou de liste.
    const r = parseImportCsv(
      '  modèle ;CARACTÉRISTIQUE; type \nPompe;Marque;Texte',
    )
    expect(r.colonnesManquantes).toEqual([])
    expect(r.lignes[0]).toEqual({
      ok: true,
      ligne: 2,
      modele: 'Pompe',
      description: undefined,
      champ: {
        cle: 'Marque',
        type: 'texte',
        unite: undefined,
        options: undefined,
        requis: false,
        defaut: null,
      },
    })
  })

  it('traite une cellule absente en fin de ligne comme une cellule vide', () => {
    // ORACLE : l'IA tronque volontiers les lignes dont la fin est vide. Le
    // parseur doit lire ces colonnes comme vides, pas comme du contenu.
    const r = parseImportCsv([ENTETE, 'Pompe;;Marque;Texte'].join('\n'))
    expect(r.lignes[0]).toMatchObject({
      ok: true,
      champ: { cle: 'Marque', requis: false, defaut: null },
    })
  })

  it('numérote les lignes en comptant l’en-tête comme ligne 1', () => {
    // ORACLE : le numéro rapporté sert à retrouver la ligne dans le collage.
    const r = parseImportCsv(
      [ENTETE, 'Pompe;;A;Texte;;;;', ';;;;;;;', 'Pompe;;C;Texte;;;;'].join(
        '\n',
      ),
    )
    expect(r.lignes.map((l) => l.ligne)).toEqual([2, 3, 4])
  })

  it('trime chaque cellule avant de la valider', () => {
    // ORACLE : les blancs de mise en forme ne sont pas des données. Une
    // colonne facultative ne contenant que des espaces reste « non remplie »,
    // sinon Unité/Valeurs possibles déclencheraient des erreurs fantômes.
    const r = parseImportCsv(
      [
        ENTETE,
        '  Pompe  ;  Pompe de relevage  ;  Marque  ;  Texte  ;   ;   ;   ;   ',
      ].join('\n'),
    )
    expect(r.lignes[0]).toEqual({
      ok: true,
      ligne: 2,
      modele: 'Pompe',
      description: 'Pompe de relevage',
      champ: {
        cle: 'Marque',
        type: 'texte',
        unite: undefined,
        options: undefined,
        requis: false,
        defaut: null,
      },
    })
  })

  it('traite un Type fait de blancs comme un Type manquant', () => {
    // ORACLE : « rien » et « des espaces » se ressemblent à l'écran — le
    // message doit accuser l'absence, pas un type illisible.
    const r = parseImportCsv([ENTETE, 'Pompe;;Marque;   ;;;;'].join('\n'))
    expect(r.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: ['Type est obligatoire pour une caractéristique.'],
    })
  })
})

describe('parseImportCsv (modèles d’équipements) — validation', () => {
  it('accepte la valeur stockée d’un type autant que son libellé', () => {
    // ORACLE : `resoudreType` reconnaît explicitement les DEUX écritures
    // (libellé affiché et valeur stockée) et ignore les espaces : « Oui / Non »
    // et « oui-non » désignent le même type.
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;;A;texte;;;;',
        'Pompe;;B;nombre;;;;',
        'Pompe;;C;date;;;;',
        'Pompe;;D;oui-non;;;;',
        'Pompe;;E;liste;;X|Y;;',
        'Pompe;;F;Oui/Non;;;;',
      ].join('\n'),
    )
    expect(ok(r.lignes).map((l) => l.champ?.type)).toEqual([
      'texte',
      'nombre',
      'date',
      'oui-non',
      'liste',
      'oui-non',
    ])
  })

  it('exige un Modèle non vide et le borne à 200 caractères', () => {
    // ORACLE : la borne annoncée par le prompt ; la longueur MAXIMALE passe,
    // le caractère suivant est refusé nommément.
    const m200 = 'M'.repeat(200)
    const r = parseImportCsv(
      [
        ENTETE,
        '   ;;Marque;Texte;;;;',
        `${m200};;Marque;Texte;;;;`,
        `${m200}X;;Marque;Texte;;;;`,
      ].join('\n'),
    )
    expect(r.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: ['Modèle est obligatoire.'],
    })
    expect(r.lignes[1]?.ok).toBe(true)
    expect(r.lignes[2]).toEqual({
      ok: false,
      ligne: 4,
      erreurs: ['Modèle dépasse 200 caractères.'],
    })
  })

  it('borne la caractéristique à 60 et l’unité à 20 caractères', () => {
    // ORACLE : bornes de `champSchema` (cle ≤ 60, unite ≤ 20). Les dépasser
    // ferait JETER la caractéristique en silence à la relecture du JSONB.
    const c60 = 'C'.repeat(60)
    const u20 = 'u'.repeat(20)
    const r = parseImportCsv(
      [
        ENTETE,
        `Pompe;;${c60};Nombre;${u20};;;`,
        `Pompe;;${c60}X;Texte;;;;`,
        `Pompe;;Débit;Nombre;${u20}X;;;`,
      ].join('\n'),
    )
    expect(r.lignes[0]?.ok).toBe(true)
    expect(r.lignes[1]).toEqual({
      ok: false,
      ligne: 3,
      erreurs: ['Caractéristique dépasse 60 caractères.'],
    })
    expect(r.lignes[2]).toEqual({
      ok: false,
      ligne: 4,
      erreurs: ['Unité dépasse 20 caractères.'],
    })
  })

  it('nomme toutes les colonnes orphelines d’une ligne « modèle seul »', () => {
    // ORACLE : sans caractéristique, Type/Unité/Valeurs possibles/Valeur par
    // défaut n'ont plus de porteur — le message les liste TOUTES et s'accorde
    // au pluriel, pour que l'utilisateur vide les bonnes cellules d'un coup.
    const r = parseImportCsv(
      [
        ENTETE,
        'Ballon;Ballon tampon;;;;;;',
        'Vase;;;Nombre;;;;',
        'Vase;;;;L;;;',
        'Vase;;;Nombre;L;;;',
        'Vase;;;;;Gaz|Fioul;;12',
        'Vase;;;;;;Oui;',
      ].join('\n'),
    )
    expect(r.lignes[0]).toEqual({
      ok: true,
      ligne: 2,
      modele: 'Ballon',
      description: 'Ballon tampon',
      champ: null,
    })
    expect(r.lignes.slice(1, 5).map((l) => (l.ok ? [] : l.erreurs))).toEqual([
      [
        "Type ne s'applique qu'à une caractéristique — Caractéristique est vide.",
      ],
      [
        "Unité ne s'applique qu'à une caractéristique — Caractéristique est vide.",
      ],
      [
        "Type, Unité ne s'appliquent qu'à une caractéristique — Caractéristique est vide.",
      ],
      [
        "Valeurs possibles, Valeur par défaut ne s'appliquent qu'à une caractéristique — Caractéristique est vide.",
      ],
    ])
    // « Obligatoire » seul ne porte rien : la ligne reste valide (décision du
    // module — seules les 4 colonnes ci-dessus décrivent une caractéristique).
    expect(r.lignes[5]).toEqual({
      ok: true,
      ligne: 7,
      modele: 'Vase',
      description: undefined,
      champ: null,
    })
  })

  it('énumère les types connus quand le Type est inconnu', () => {
    // ORACLE : un type inconnu doit rendre la correction évidente (la liste
    // exacte des valeurs acceptées) ; et les colonnes qui dépendent du type
    // sont signalées SANS que le module ne trébuche sur un type non résolu.
    const r = parseImportCsv(
      [ENTETE, 'Pompe;;Marque;Machin;kW;Gaz|Fioul;;12'].join('\n'),
    )
    expect(r.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: [
        'Type « Machin » inconnu (valeurs possibles : Texte, Nombre, Date, Oui / Non, Liste).',
        "Valeurs possibles ne s'applique qu'au type « Liste ».",
        "Unité ne s'applique qu'au type « Nombre ».",
      ],
    })
  })

  it('nettoie les choix d’une liste et refuse une liste sans choix', () => {
    // ORACLE : la cellule est écrite à la main derrière l'IA — barres en trop
    // et espaces autour des choix ne doivent pas créer d'options fantômes.
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;;Énergie;Liste;;  Gaz |  | Fioul  ;;Fioul',
        'Pompe;;Source;Liste;;  |  ;;',
      ].join('\n'),
    )
    expect(r.lignes[0]).toMatchObject({
      ok: true,
      champ: { options: ['Gaz', 'Fioul'], defaut: 'Fioul' },
    })
    expect(r.lignes[1]).toEqual({
      ok: false,
      ligne: 3,
      erreurs: [
        'Valeurs possibles est obligatoire pour une caractéristique de type « Liste » (valeurs séparées par « | »).',
      ],
    })
  })

  it('lit « Obligatoire » en Oui/Non et refuse le reste', () => {
    // ORACLE : vide vaut « Non » (le cas le plus courant ne se saisit pas) ;
    // tout autre mot est refusé nommément plutôt qu'interprété.
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;;A;Texte;;;;',
        'Pompe;;B;Texte;;;oui;',
        'Pompe;;C;Texte;;;NON;',
        'Pompe;;D;Texte;;;Peut-être;',
      ].join('\n'),
    )
    expect(ok(r.lignes).map((l) => l.champ?.requis)).toEqual([
      false,
      true,
      false,
    ])
    expect(r.lignes[3]).toEqual({
      ok: false,
      ligne: 5,
      erreurs: ['Obligatoire : « Peut-être » doit être « Oui » ou « Non ».'],
    })
  })

  it('accepte une caractéristique obligatoire SANS valeur par défaut', () => {
    // ORACLE : « Obligatoire » décrit la saisie future sur l'ÉQUIPEMENT, pas
    // la définition du modèle. Exiger un défaut ici interdirait le cas le plus
    // courant : une information à renseigner équipement par équipement.
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;;Marque;Texte;;;Oui;',
        'Pompe;;Repère;Texte;;;Oui;   ',
      ].join('\n'),
    )
    // Une cellule de blancs ne vaut pas davantage une valeur par défaut.
    expect(r.lignes.map((l) => (l.ok ? l.champ : l.erreurs))).toEqual([
      {
        cle: 'Marque',
        type: 'texte',
        unite: undefined,
        options: undefined,
        requis: true,
        defaut: null,
      },
      {
        cle: 'Repère',
        type: 'texte',
        unite: undefined,
        options: undefined,
        requis: true,
        defaut: null,
      },
    ])
  })

  it('valide la valeur par défaut contre le type déclaré', () => {
    // ORACLE : un défaut hors liste ou une date impossible se corrige ICI, à
    // la définition — pas plus tard, équipement par équipement.
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;;Énergie;Liste;;Gaz|Fioul;;Charbon',
        'Pompe;;Pose;Date;;;;31/02/2026',
      ].join('\n'),
    )
    expect(r.lignes.map((l) => (l.ok ? [] : l.erreurs))).toEqual([
      [
        "Valeur par défaut : « Énergie » : « Charbon » n'est pas une valeur autorisée (Gaz, Fioul).",
      ],
      [
        "Valeur par défaut : « Pose » : « 31/02/2026 » n'est pas une date valide (JJ/MM/AAAA).",
      ],
    ])
  })

  it('ne valide pas le défaut d’une définition déjà fautive', () => {
    // ORACLE : tant que la définition du champ est cassée, un message sur sa
    // valeur par défaut porterait sur un champ qui n'existe pas encore. Une
    // seule cause, un seul message.
    const r = parseImportCsv(
      [ENTETE, `Pompe;;Débit;Nombre;${'u'.repeat(21)};;;beaucoup`].join('\n'),
    )
    expect(r.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: ['Unité dépasse 20 caractères.'],
    })
  })

  it('reconnaît un modèle et une caractéristique stockés avec des blancs', () => {
    // ORACLE : des blancs parasites en base désignent le MÊME modèle et la
    // MÊME caractéristique — sans ce recadrage, l'import écraserait ou
    // dupliquerait une définition déjà en place.
    const r = parseImportCsv(
      [ENTETE, 'Chaudière;;marque;Texte;;;;'].join('\n'),
      [
        {
          id: 'm1',
          nom: '  Chaudière  ',
          champs: [
            { cle: '  Marque  ', type: 'texte', requis: false, defaut: null },
          ],
        },
      ],
    )
    expect(r.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      ignoree: true,
      erreurs: [
        '« marque » est déjà définie sur « Chaudière » — ligne ignorée.',
      ],
    })
  })

  it('n’attache une description qu’aux lignes qui en portent une', () => {
    // ORACLE : une cellule Description vide ne doit pas devenir une chaîne
    // vide écrite en base par-dessus une description existante.
    const r = parseImportCsv(
      [
        ENTETE,
        'Pompe;;Marque;Texte;;;;',
        'Pompe;Relevage;Débit;Nombre;;;;',
      ].join('\n'),
    )
    expect(ok(r.lignes).map((l) => l.description)).toEqual([
      undefined,
      'Relevage',
    ])
  })
})

describe('construirePlan (modèles d’équipements) — regroupement', () => {
  const champ = (cle: string): ModeleEquipementCsvRowOk => ({
    ok: true,
    ligne: 2,
    modele: 'Pompe',
    champ: { cle, type: 'texte', requis: false, defaut: null },
  })

  it('garde la PREMIÈRE description rencontrée pour un modèle', () => {
    // ORACLE : le prompt demande la description sur la PREMIÈRE ligne du
    // modèle ; une répétition plus bas ne doit pas la réécrire.
    const plan = construirePlan(
      [
        { ...champ('Marque'), description: 'Pompe de relevage' },
        { ...champ('Débit'), description: 'Autre chose' },
      ],
      [],
    )
    expect(plan.modeles[0]?.description).toBe('Pompe de relevage')
  })

  it('n’écrit pas de description sur un modèle dont aucune ligne n’en porte', () => {
    // ORACLE : le plan est appliqué tel quel. Poser une description
    // `undefined` sur un modèle DÉJÀ en base effacerait la sienne ; une
    // propriété non posée, elle, ne touche à rien.
    const plan = construirePlan([champ('Marque')], [])
    const m = plan.modeles[0]
    expect(m).toBeDefined()
    expect(Object.hasOwn(m!, 'description')).toBe(false)
  })

  it('n’ajoute rien pour une ligne « modèle seul »', () => {
    // ORACLE : `champ: null` signale un modèle SANS caractéristique ; le
    // compter en ajouterait une vide au modèle créé.
    const plan = construirePlan(
      [
        { ok: true, ligne: 2, modele: 'Ballon', champ: null },
        { ...champ('Marque'), modele: 'Ballon' },
      ],
      [],
    )
    expect(plan.nbCaracteristiques).toBe(1)
    expect(plan.modeles[0]?.champsAjoutes.map((c) => c.cle)).toEqual(['Marque'])
    // Un modèle inconnu part de zéro : aucune caractéristique « déjà en base ».
    expect(plan.modeles[0]?.champsExistants).toEqual([])
  })

  it('compte séparément créations et complétions', () => {
    // ORACLE : les deux compteurs ne mesurent pas la même chose — le résumé
    // dirait n'importe quoi si l'un valait l'autre. Un modèle existant SANS
    // caractéristique apportée n'est pas « à compléter » : rien ne l'attend.
    const existantsPlan: ModeleEquipementExistant[] = [
      { id: 'm1', nom: 'Chaudière', champs: [] },
      { id: 'm2', nom: 'Ballon', champs: [] },
    ]
    const plan = construirePlan(
      [
        { ...champ('Marque'), modele: 'Pompe' },
        { ...champ('Marque'), modele: 'Ventilateur' },
        { ...champ('Marque'), modele: 'Extracteur' },
        { ...champ('Marque'), modele: 'Chaudière' },
        { ok: true, ligne: 6, modele: 'Ballon', champ: null },
      ],
      existantsPlan,
    )
    // 3 inconnus ≠ 2 déjà en base : les deux compteurs sont bien distincts.
    expect(plan.nbCreations).toBe(3)
    expect(plan.nbCompletions).toBe(1)
    expect(plan.nbCaracteristiques).toBe(4)
  })
})

describe('resumePlan (modèles d’équipements)', () => {
  const plan = (
    nbCreations: number,
    nbCompletions: number,
    nbCaracteristiques: number,
  ): PlanImportModelesEquipements => ({
    modeles: [],
    nbCreations,
    nbCompletions,
    nbCaracteristiques,
  })

  // ORACLE : phrase française destinée au bouton de confirmation. Règles :
  // un compteur nul ne s'écrit pas (annoncer « 0 modèle à créer » ferait
  // croire à une erreur), le pluriel suit le nombre, et les morceaux se
  // séparent par des virgules sauf le dernier, introduit par « et ».
  it.each([
    [plan(0, 0, 0), ''],
    [plan(1, 0, 0), '1 modèle à créer'],
    [plan(2, 0, 0), '2 modèles à créer'],
    [plan(0, 1, 0), '1 modèle à compléter'],
    [plan(0, 3, 0), '3 modèles à compléter'],
    [plan(0, 0, 1), '1 caractéristique'],
    [plan(0, 0, 5), '5 caractéristiques'],
    [plan(1, 1, 0), '1 modèle à créer et 1 modèle à compléter'],
    [plan(1, 0, 2), '1 modèle à créer et 2 caractéristiques'],
    [plan(0, 2, 3), '2 modèles à compléter et 3 caractéristiques'],
    [
      plan(2, 1, 7),
      '2 modèles à créer, 1 modèle à compléter et 7 caractéristiques',
    ],
  ])('résume %o en « %s »', (p, attendu) => {
    expect(resumePlan(p)).toBe(attendu)
  })
})

describe('buildImportPrompt (modèles d’équipements)', () => {
  it('annonce la catégorie, les types et ce qui existe déjà', () => {
    const prompt = buildImportPrompt({
      categorieNom: 'Chauffage',
      existants,
    })
    expect(prompt).toContain('« Chauffage »')
    expect(prompt).toContain('« Oui / Non »')
    expect(prompt).toContain(
      'Chaudière (caractéristiques déjà définies : Marque)',
    )
  })

  it('énonce toutes les règles de format que le parseur suppose', () => {
    // ORACLE : le prompt est le CONTRAT passé à l'IA. Chaque règle correspond
    // à une hypothèse du parseur (séparateur, en-tête unique, une ligne par
    // caractéristique, modèle sans caractéristique sur une seule ligne,
    // échappement). Si elle disparaît du prompt, l'IA produit un CSV « conforme
    // au prompt » que l'import refusera.
    const lignes = buildImportPrompt({
      categorieNom: 'Chauffage',
      existants: [],
    }).split('\n')
    for (const regle of [
      'Format EXACT attendu :',
      '- Séparateur de colonnes : point-virgule ( ; )',
      '- Encodage : UTF-8',
      "- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre.",
      '- Ensuite UNE LIGNE PAR CARACTÉRISTIQUE. Le nom du modèle est RÉPÉTÉ sur chacune de ses lignes, et ses lignes se suivent.',
      "- Un modèle sans aucune caractéristique s'écrit sur une seule ligne, avec Caractéristique et les colonnes suivantes vides.",
      '- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.',
      "- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).",
      'Colonnes :',
    ]) {
      expect(lignes).toContain(regle)
    }
  })

  it('décrit CHAQUE colonne lue par le parseur, avec sa contrainte', () => {
    // ORACLE : propriété de BOUCLE prompt ↔ parseur. Toute colonne que
    // `parseImportCsv` sait lire doit être annoncée, et les contraintes que le
    // parseur fait respecter (liste close des types, séparateur « | » des
    // choix, borne de 60 caractères) doivent être dites à l'IA — sinon
    // l'utilisateur récolte des erreurs qu'aucune consigne n'annonçait.
    const lignes = buildImportPrompt({
      categorieNom: 'Chauffage',
      existants: [],
    }).split('\n')
    const puce = (colonne: string) =>
      lignes.find((l) => l.startsWith(`- ${colonne} — `))
    for (const colonne of [
      'Modèle',
      'Description du modèle',
      'Caractéristique',
      'Type',
      'Unité',
      'Valeurs possibles',
      'Obligatoire',
      'Valeur par défaut',
    ]) {
      expect(puce(colonne)).toBeDefined()
    }
    // La liste CLOSE des types, dans l'ordre et l'orthographe que `resoudreType` accepte.
    expect(puce('Type')).toBe(
      '- Type — obligatoire dès que Caractéristique est rempli. UNIQUEMENT une de ces valeurs : « Texte », « Nombre », « Date », « Oui / Non », « Liste ».',
    )
    expect(puce('Caractéristique')).toContain('60 caractères maximum')
    expect(puce('Unité')).toContain('UNIQUEMENT si Type vaut « Nombre »')
    expect(puce('Valeurs possibles')).toContain('barre verticale ( | )')
    expect(puce('Valeurs possibles')).toContain('Gaz | Fioul | Électrique')
    expect(puce('Obligatoire')).toContain('« Oui »')
    expect(puce('Valeur par défaut')).toContain('JJ/MM/AAAA')
  })

  it('reste un document lisible : paragraphes séparés, invitation en dernier', () => {
    // ORACLE : le prompt est collé dans une IA avec les données brutes À LA
    // SUITE. Sa structure (un paragraphe par idée, une ligne vide entre
    // chacun, une invitation finale suivie d'une ligne vide) est ce qui évite
    // que les données collées se retrouvent soudées au texte d'instruction.
    const lignes = buildImportPrompt({
      categorieNom: 'Chauffage',
      existants: [],
    }).split('\n')
    expect(lignes[0]).toContain("MODÈLES D'ÉQUIPEMENTS")
    expect(lignes[1]).toBe('')
    expect(lignes[2]).toContain('gabarit')
    expect(lignes[3]).toBe('')
    expect(lignes[4]).toBe(
      'Catégorie ciblée : « Chauffage ». Tous les modèles du CSV y seront rangés.',
    )
    expect(lignes[5]).toBe('')
    expect(lignes[6]).toBe('Format EXACT attendu :')
    expect(lignes[lignes.indexOf('Colonnes :') - 1]).toBe('')

    const i = lignes.indexOf(INVITATION)
    expect(i).toBeGreaterThan(0)
    expect(lignes[i - 1]).toBe('')
    // Sans modèle existant, rien ne s'intercale entre les colonnes et l'invitation.
    expect(lignes[i - 2]?.startsWith('- Valeur par défaut — ')).toBe(true)
    expect(lignes.slice(i + 1)).toEqual([''])
  })

  it('n’ouvre la liste des modèles existants que s’il y en a', () => {
    // ORACLE : annoncer une liste vide invite l'IA à la remplir — exactement
    // le doublon qu'on cherche à éviter. Et pour chaque modèle listé, l'IA
    // doit savoir ce qu'il porte DÉJÀ, sinon elle le recrée à l'identique.
    expect(
      buildImportPrompt({ categorieNom: 'Chauffage', existants: [] }),
    ).not.toContain('Modèles DÉJÀ enregistrés')

    const lignes = buildImportPrompt({
      categorieNom: 'Chauffage',
      existants: [
        ...existants,
        { id: 'm2', nom: 'Ballon', champs: [] },
        {
          id: 'm3',
          nom: 'Vase',
          champs: [
            { cle: 'Volume', type: 'nombre', requis: false, defaut: null },
            { cle: 'Pression', type: 'nombre', requis: false, defaut: null },
          ],
        },
      ],
    }).split('\n')
    const i = lignes.indexOf(
      "Modèles DÉJÀ enregistrés dans cette catégorie. Ne les recrée pas à l'identique : ne les remets dans le CSV que s'il leur manque une caractéristique (elle sera ajoutée ; celles déjà présentes ne bougeront pas).",
    )
    expect(i).toBeGreaterThan(0)
    expect(lignes[i - 1]).toBe('')
    expect(lignes[i - 2]?.startsWith('- Valeur par défaut — ')).toBe(true)
    expect(lignes.slice(i + 1, i + 4)).toEqual([
      '- Chaudière (caractéristiques déjà définies : Marque)',
      '- Ballon (aucune caractéristique)',
      '- Vase (caractéristiques déjà définies : Volume, Pression)',
    ])
    expect(lignes[i + 4]).toBe('')
  })
})
