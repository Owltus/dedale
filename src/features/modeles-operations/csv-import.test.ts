import { describe, expect, it } from 'vitest'
import {
  CSV_DELIMITER,
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ModeleOperationCsvRowOk,
  type ModeleOperationExistant,
  type PlanImportModelesOperations,
} from './csv-import'
import type {
  OperationCsvResolue,
  OperationRefs,
} from '@/features/operations/csv-import'

const refs: OperationRefs = {
  types: [
    { id: 1, libelle: 'Vérification', necessite_seuils: false },
    { id: 4, libelle: 'Mesure', necessite_seuils: true },
  ],
  unites: [
    { id: 1, nom: 'Degrés Celsius', symbole: '°C', necessite_seuils: true },
  ],
}

const ENTETE =
  "Modèle d'opérations;Description du modèle;Opération;Ordre;Type d'opération;Unité;Seuil minimum;Seuil maximum;Description de l'opération"

const existants: ModeleOperationExistant[] = [
  {
    id: 'mo1',
    nom: 'Entretien chaudière',
    operations: ['Nettoyer le brûleur'],
  },
]

const ok = (lignes: ReturnType<typeof parseImportCsv>['lignes']) =>
  lignes.filter((l): l is ModeleOperationCsvRowOk => l.ok)

describe('parseImportCsv (modèles d’opérations)', () => {
  it('exige le modèle et le libellé de l’opération', () => {
    const r = parseImportCsv('Autre;Colonne\nx;y', refs)
    expect(r.colonnesManquantes).toEqual(["Modèle d'opérations", 'Opération'])
  })

  it('rattache chaque opération à son modèle', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Entretien VMC;Entretien annuel;Nettoyer les filtres;1;Vérification;;;;Filtres G4',
        'Entretien VMC;;Mesurer le débit;2;Mesure;Degrés Celsius (°C);10;30;',
      ].join('\n'),
      refs,
    )
    expect(r.colonnesManquantes).toEqual([])
    const lignes = ok(r.lignes)
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({
      modele: 'Entretien VMC',
      description: 'Entretien annuel',
    })
    expect(lignes[0]?.operation.values).toMatchObject({
      nom: 'Nettoyer les filtres',
      ordre: '1',
      type_operation_id: '1',
      description: 'Filtres G4',
    })
    expect(lignes[1]?.operation.values).toMatchObject({
      unite_id: '1',
      seuil_minimum: '10',
      seuil_maximum: '30',
    })
  })

  it('ignore une opération déjà présente sur un modèle existant', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Entretien chaudière;;Nettoyer le brûleur;;Vérification;;;;',
        'Entretien chaudière;;Contrôler la pression;;Vérification;;;;',
      ].join('\n'),
      refs,
      existants,
    )
    expect(r.lignes[0]?.ok === false && r.lignes[0].ignoree).toBe(true)
    expect(ok(r.lignes)).toHaveLength(1)
  })

  it('refuse une ligne sans opération', () => {
    const r = parseImportCsv(
      [ENTETE, 'Entretien VMC;;;;Vérification;;;;'].join('\n'),
      refs,
    )
    expect(ok(r.lignes)).toHaveLength(0)
  })
})

describe('construirePlan (modèles d’opérations)', () => {
  it('sépare les créations des complétions', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Entretien chaudière;;Contrôler la pression;;Vérification;;;;',
        'Entretien VMC;Annuel;Nettoyer les filtres;;Vérification;;;;',
      ].join('\n'),
      refs,
      existants,
    )
    const plan = construirePlan(ok(r.lignes), existants)
    expect(plan.nbCreations).toBe(1)
    expect(plan.nbCompletions).toBe(1)
    expect(plan.nbOperations).toBe(2)
    expect(
      plan.modeles.find((m) => m.nom === 'Entretien chaudière')?.existantId,
    ).toBe('mo1')
    expect(resumePlan(plan)).toContain('2 opérations')
  })
})

describe('buildImportPrompt (modèles d’opérations)', () => {
  it('énumère les référentiels et ce qui existe déjà', () => {
    const prompt = buildImportPrompt({
      categorieNom: 'CVC',
      refs,
      existants,
    })
    expect(prompt).toContain('« CVC »')
    expect(prompt).toContain('« Mesure »')
    expect(prompt).toContain('opérations déjà définies : Nettoyer le brûleur')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Durcissement Martin : ce que voit l'utilisateur quand son collage est faux.
// ───────────────────────────────────────────────────────────────────────────

/** Les erreurs d'une ligne refusée (échoue si la ligne a été acceptée). */
const erreursLigne = (
  r: ReturnType<typeof parseImportCsv>,
  index: number,
): string[] => {
  const l = r.lignes[index]
  expect(l, `la ligne d'index ${String(index)} devrait exister`).toBeDefined()
  expect(l?.ok, `la ligne d'index ${String(index)} devrait être refusée`).toBe(
    false,
  )
  return l && !l.ok ? l.erreurs : []
}

const lire = (...lignes: string[]) =>
  parseImportCsv([ENTETE, ...lignes].join('\n'), refs)

describe('parseImportCsv — en-tête et forme du collage', () => {
  it('un collage vide n’est pas un défaut de colonnes', () => {
    // Oracle : ne rien avoir collé n'est pas un en-tête fautif — on n'affiche
    // ni liste de colonnes manquantes ni aperçu.
    for (const vide of ['', '\n', '   \n  ']) {
      const r = parseImportCsv(vide, refs)
      expect(r.colonnesManquantes).toEqual([])
      expect(r.lignes).toEqual([])
    }
  })

  it('un en-tête incomplet ne laisse passer AUCUNE ligne', () => {
    // Oracle : tant qu'une colonne obligatoire manque, on ne devine pas.
    const r = parseImportCsv('Autre;Colonne\nx;y', refs)
    expect(r.colonnesManquantes).toEqual(["Modèle d'opérations", 'Opération'])
    expect(r.lignes).toEqual([])
  })

  it('n’exige PAS les colonnes facultatives d’une opération', () => {
    // Oracle : un CSV qui ne décrit que des gestes simples (ni mesure, ni
    // seuil) est valide ; seuls le modèle et le libellé sont indispensables.
    const r = parseImportCsv(
      [
        "Modèle d'opérations;Opération;Type d'opération",
        'Entretien VMC;Nettoyer les filtres;Vérification',
      ].join('\n'),
      refs,
    )
    expect(r.colonnesManquantes).toEqual([])
    const [ligne] = ok(r.lignes)
    expect(ligne?.operation.values).toMatchObject({
      nom: 'Nettoyer les filtres',
      ordre: '',
      description: '',
    })
    expect(ligne?.description).toBeUndefined()
  })

  it('accepte un en-tête dans le DÉSORDRE, où que soient modèle et opération', () => {
    // Oracle : seul le NOM d'une colonne compte, jamais sa position.
    const operationEnTete = parseImportCsv(
      [
        "Opération;Modèle d'opérations;Type d'opération",
        'Nettoyer les filtres;Entretien VMC;Vérification',
      ].join('\n'),
      refs,
    )
    expect(ok(operationEnTete.lignes)[0]).toMatchObject({
      modele: 'Entretien VMC',
    })

    const modeleEnDeuxieme = parseImportCsv(
      [
        "Type d'opération;Modèle d'opérations;Opération",
        'Vérification;Entretien VMC;Nettoyer les filtres',
      ].join('\n'),
      refs,
    )
    expect(ok(modeleEnDeuxieme.lignes)[0]?.operation.values.nom).toBe(
      'Nettoyer les filtres',
    )
  })

  it('une ligne plus courte que l’en-tête vaut « cellules de fin vides »', () => {
    // Oracle : un collage tronqué à droite ne doit pas fabriquer de valeurs —
    // et si c'est la colonne du modèle qui manque, l'erreur le dit.
    const courte = lire('Entretien VMC;;Nettoyer les filtres;;Vérification')
    const [ligne] = ok(courte.lignes)
    expect(ligne?.operation.values.description).toBe('')
    expect(ligne?.description).toBeUndefined()

    const modeleTronque = parseImportCsv(
      [
        "Opération;Type d'opération;Modèle d'opérations",
        'Nettoyer les filtres;Vérification',
      ].join('\n'),
      refs,
    )
    expect(erreursLigne(modeleTronque, 0)).toEqual([
      "Modèle d'opérations est obligatoire.",
    ])
  })

  it('laisse la description VIDE quand sa colonne est absente de la ligne', () => {
    // Oracle : la description du modèle est facultative ; qu'elle soit absente
    // de l'en-tête ou simplement au-delà de la fin d'une ligne courte, le
    // résultat est le même — pas de description, pas de valeur inventée.
    const colonneAbsente = parseImportCsv(
      [
        "Modèle d'opérations;Opération;Type d'opération",
        'Entretien VMC;Nettoyer;Vérification',
      ].join('\n'),
      refs,
    )
    expect(ok(colonneAbsente.lignes)[0]?.description).toBeUndefined()

    const celluleManquante = parseImportCsv(
      [
        "Modèle d'opérations;Opération;Type d'opération;Description du modèle",
        'Entretien VMC;Nettoyer;Vérification',
      ].join('\n'),
      refs,
    )
    expect(ok(celluleManquante.lignes)[0]?.description).toBeUndefined()
  })

  it('numérote les lignes comme l’utilisateur les voit, l’en-tête comptant pour 1', () => {
    // Oracle : le numéro rapporté sert à retrouver la ligne dans le collage ;
    // la première ligne de données est donc la n° 2.
    const r = lire(
      'Entretien VMC;;Nettoyer les filtres;;Vérification;;;;',
      'Entretien VMC;;Contrôler le moteur;;Vérification;;;;',
      ';;Changer le filtre;;Vérification;;;;',
    )
    expect(r.lignes.map((l) => l.ligne)).toEqual([2, 3, 4])
    expect(r.lignes[2]?.ok).toBe(false)
  })
})

describe('parseImportCsv — le modèle lui-même', () => {
  it('réclame le nom du modèle même quand l’opération, elle, est valide', () => {
    // Oracle : une opération irréprochable ne rachète pas un modèle anonyme —
    // sans nom de modèle, on ne saurait pas où l'écrire.
    const r = lire(';;Nettoyer les filtres;;Vérification;;;;')
    expect(erreursLigne(r, 0)).toEqual(["Modèle d'opérations est obligatoire."])
  })

  it('borne le nom du modèle à 200 caractères INCLUS', () => {
    // Oracle : 200 passe, 201 non — la borne est inclusive.
    const r = lire(
      `${'M'.repeat(200)};;Nettoyer;;Vérification;;;;`,
      `${'M'.repeat(201)};;Nettoyer;;Vérification;;;;`,
    )
    expect(r.lignes[0]?.ok).toBe(true)
    expect(erreursLigne(r, 1)).toEqual([
      "Modèle d'opérations dépasse 200 caractères.",
    ])
  })

  it('rogne les espaces autour du nom du modèle et de sa description', () => {
    // Oracle : les espaces d'un collage depuis un tableur ne partent pas en base.
    const r = lire(
      '  Entretien VMC  ;  Entretien annuel  ;Nettoyer;;Vérification;;;;',
    )
    const [ligne] = ok(r.lignes)
    expect(ligne?.modele).toBe('Entretien VMC')
    expect(ligne?.description).toBe('Entretien annuel')
  })

  it('remonte telles quelles les erreurs de l’opération', () => {
    // Oracle : le module de modèle ne réécrit pas les diagnostics d'opération —
    // il les recopie, sinon l'utilisateur ne sait pas quelle cellule corriger.
    const r = lire('Entretien VMC;;Nettoyer;;Bricolage;;;;')
    expect(erreursLigne(r, 0)).toEqual([
      "Type d'opération « Bricolage » inconnu (valeurs possibles : Vérification, Mesure).",
    ])
  })

  it('cumule l’erreur de modèle et celle de l’opération', () => {
    // Oracle : on ne fait pas corriger l'utilisateur en deux passes — les deux
    // défauts d'une même ligne sont signalés ensemble.
    const r = lire(';;;;;;;;')
    expect(erreursLigne(r, 0)).toEqual([
      "Modèle d'opérations est obligatoire.",
      'Opération est obligatoire.',
      "Type d'opération est obligatoire.",
    ])
  })
})

describe('parseImportCsv — doublons d’opérations', () => {
  it('ignore un doublon apparu DANS le collage, pour un modèle nouveau', () => {
    // Oracle : la déduplication vaut aussi entre deux lignes du CSV, pas
    // seulement face à la base — et elle ignore la casse et les espaces.
    const r = lire(
      'Entretien VMC;;Nettoyer les filtres;;Vérification;;;;',
      'Entretien VMC;;  NETTOYER LES FILTRES  ;;Vérification;;;;',
    )
    expect(ok(r.lignes)).toHaveLength(1)
    expect(r.lignes[1]).toMatchObject({
      ok: false,
      ignoree: true,
      erreurs: [
        '« NETTOYER LES FILTRES » est déjà une opération de « Entretien VMC » — ligne ignorée.',
      ],
    })
  })

  it('nomme l’opération ET le modèle dans le message d’une ligne ignorée', () => {
    // Oracle : une ligne écartée doit dire POURQUOI, en citant les deux noms.
    const r = parseImportCsv(
      [
        ENTETE,
        'Entretien chaudière;;Nettoyer le brûleur;;Vérification;;;;',
      ].join('\n'),
      refs,
      existants,
    )
    expect(erreursLigne(r, 0)).toEqual([
      '« Nettoyer le brûleur » est déjà une opération de « Entretien chaudière » — ligne ignorée.',
    ])
  })

  it('reconnaît un modèle existant malgré la casse', () => {
    // Oracle : « ENTRETIEN CHAUDIÈRE » EST le modèle « Entretien chaudière » —
    // son opération déjà en base est donc ignorée, pas ajoutée en double.
    const r = parseImportCsv(
      [
        ENTETE,
        'ENTRETIEN CHAUDIÈRE;;Nettoyer le brûleur;;Vérification;;;;',
      ].join('\n'),
      refs,
      existants,
    )
    expect(r.lignes[0]).toMatchObject({ ok: false, ignoree: true })
  })

  it('reconnaît un modèle et une opération dont le libellé STOCKÉ traîne des espaces', () => {
    // Oracle : la normalisation rogne AUSSI les valeurs venues de la base —
    // un libellé enregistré avec des espaces parasites reste le même libellé,
    // sinon l'import le recrée en double.
    const enBase: ModeleOperationExistant[] = [
      {
        id: 'mo1',
        nom: '  Entretien chaudière  ',
        operations: ['  Nettoyer le brûleur  '],
      },
    ]
    const r = parseImportCsv(
      [
        ENTETE,
        'Entretien chaudière;;Nettoyer le brûleur;;Vérification;;;;',
      ].join('\n'),
      refs,
      enBase,
    )
    expect(r.lignes[0]).toMatchObject({ ok: false, ignoree: true })
  })

  it('n’ignore PAS la même opération portée par deux modèles différents', () => {
    // Oracle : la déduplication est par modèle, pas globale.
    const r = lire(
      'Entretien VMC;;Nettoyer les filtres;;Vérification;;;;',
      'Entretien CTA;;Nettoyer les filtres;;Vérification;;;;',
    )
    expect(ok(r.lignes)).toHaveLength(2)
  })
})

/** Construit une opération résolue de toutes pièces. */
const operation = (nom: string): OperationCsvResolue => ({
  values: {
    nom,
    ordre: '',
    type_operation_id: '1',
    unite_id: '',
    seuil_minimum: '',
    seuil_maximum: '',
    description: '',
  },
  aUnite: false,
  requiresSeuils: false,
})

/** Une ligne valide fabriquée à la main, pour tester le regroupement seul. */
const ligneOk = (
  modele: string,
  nomOperation: string,
  description?: string,
): ModeleOperationCsvRowOk => ({
  ok: true,
  ligne: 2,
  modele,
  description,
  operation: operation(nomOperation),
})

describe('construirePlan — regroupement par modèle', () => {
  it('rassemble les lignes d’un même modèle et garde la description de la PREMIÈRE', () => {
    // Oracle : la description n'est lue qu'une fois, sur la première ligne du
    // modèle ; les suivantes n'apportent que des opérations.
    const plan = construirePlan(
      [
        ligneOk('Entretien VMC', 'Nettoyer les filtres', 'Entretien annuel'),
        ligneOk('Entretien VMC', 'Mesurer le débit', 'Texte concurrent'),
        ligneOk('Entretien VMC', 'Contrôler le moteur'),
      ],
      [],
    )
    expect(plan.modeles).toHaveLength(1)
    expect(plan.modeles[0]).toMatchObject({
      nom: 'Entretien VMC',
      existantId: null,
      description: 'Entretien annuel',
    })
    expect(plan.modeles[0]?.operations.map((o) => o.values.nom)).toEqual([
      'Nettoyer les filtres',
      'Mesurer le débit',
      'Contrôler le moteur',
    ])
    expect(plan.nbOperations).toBe(3)
  })

  it('laisse la description vide quand aucune ligne n’en porte', () => {
    // Oracle : « pas de description » se dit `undefined`, pas chaîne vide.
    const plan = construirePlan([ligneOk('Entretien VMC', 'Nettoyer')], [])
    expect(plan.modeles[0]?.description).toBeUndefined()
  })

  it('compte séparément créations, complétions et opérations', () => {
    // Oracle : un modèle À CRÉER n'a pas d'id ; un modèle À COMPLÉTER en a un.
    const enBase: ModeleOperationExistant[] = [
      { id: 'mo1', nom: 'Entretien chaudière', operations: ['Nettoyer'] },
    ]
    const plan = construirePlan(
      [
        ligneOk('Neuf A', 'a'),
        ligneOk('Neuf B', 'b'),
        ligneOk('Neuf C', 'c'),
        ligneOk('entretien chaudière', 'd'),
      ],
      enBase,
    )
    expect(plan.nbCreations).toBe(3)
    expect(plan.nbCompletions).toBe(1)
    expect(plan.nbOperations).toBe(4)
    // Le nom canonique de la base l'emporte sur la casse du collage ; un modèle
    // inconnu garde, lui, le nom écrit par l'utilisateur.
    expect(plan.modeles.map((m) => m.nom)).toEqual([
      'Neuf A',
      'Neuf B',
      'Neuf C',
      'Entretien chaudière',
    ])
    expect(plan.modeles.map((m) => m.existantId)).toEqual([
      null,
      null,
      null,
      'mo1',
    ])
  })
})

describe('resumePlan — énumération française', () => {
  const resume = (
    nbCreations: number,
    nbCompletions: number,
    nbOperations: number,
  ) =>
    resumePlan({
      modeles: [],
      nbCreations,
      nbCompletions,
      nbOperations,
    } satisfies PlanImportModelesOperations)

  it('ne dit rien quand il n’y a rien à écrire', () => {
    // Oracle : zéro n'est pas une information — « 0 modèle à créer » est du bruit.
    expect(resume(0, 0, 0)).toBe('')
  })

  it('n’énumère que les compteurs non nuls', () => {
    // Oracle : chaque terme absent disparaît de la phrase, sans virgule
    // orpheline ni « et » pendant.
    expect(resume(1, 0, 0)).toBe('1 modèle à créer')
    expect(resume(0, 1, 0)).toBe('1 modèle à compléter')
    expect(resume(0, 0, 1)).toBe('1 opération')
  })

  it('accorde le pluriel à partir de 2', () => {
    // Oracle : en français, 1 reste au singulier et 2 passe au pluriel.
    expect(resume(2, 0, 0)).toBe('2 modèles à créer')
    expect(resume(0, 2, 0)).toBe('2 modèles à compléter')
    expect(resume(0, 0, 2)).toBe('2 opérations')
  })

  it('joint deux termes par « et »', () => {
    expect(resume(1, 1, 0)).toBe('1 modèle à créer et 1 modèle à compléter')
    expect(resume(1, 0, 3)).toBe('1 modèle à créer et 3 opérations')
    expect(resume(0, 2, 5)).toBe('2 modèles à compléter et 5 opérations')
  })

  it('joint trois termes par des virgules puis « et » devant le dernier', () => {
    // Oracle : « A, B et C » — la virgule sépare, « et » conclut.
    expect(resume(2, 1, 7)).toBe(
      '2 modèles à créer, 1 modèle à compléter et 7 opérations',
    )
  })
})

describe('buildImportPrompt — le prompt est le CONTRAT donné à l’IA', () => {
  const deuxModeles: ModeleOperationExistant[] = [
    {
      id: 'mo1',
      nom: 'Entretien chaudière',
      operations: ['Nettoyer le brûleur', 'Contrôler la pression'],
    },
    { id: 'mo2', nom: 'Entretien VMC', operations: [] },
  ]
  const prompt = buildImportPrompt({
    categorieNom: 'CVC',
    refs,
    existants: deuxModeles,
  })

  it('annonce la tâche, l’objet métier et la catégorie ciblée', () => {
    // Oracle : sans ces trois repères, l'IA ne sait ni quoi produire, ni pour
    // quel objet, ni où cela sera rangé.
    expect(prompt).toContain(
      "Tu vas produire un fichier CSV pour créer des MODÈLES D'OPÉRATIONS",
    )
    expect(prompt).toContain(
      "Un modèle d'opérations est une liste d'opérations",
    )
    expect(prompt).toContain('Catégorie ciblée : « CVC »')
  })

  it('énonce TOUTES les règles de forme que le lecteur CSV applique vraiment', () => {
    // Oracle : chaque règle appliquée par `parseCsv` + `parseImportCsv` doit
    // être écrite, sinon l'IA produit un fichier que l'import rejettera.
    expect(prompt).toContain(
      `- Séparateur de colonnes : point-virgule ( ${CSV_DELIMITER} )`,
    )
    expect(prompt).toContain('- Encodage : UTF-8')
    expect(prompt).toContain(
      "- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre.",
    )
    expect(prompt).toContain('- Ensuite UNE LIGNE PAR OPÉRATION.')
    expect(prompt).toContain(
      '- Chaque modèle doit contenir au moins une opération.',
    )
    expect(prompt).toContain(
      '- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.',
    )
    expect(prompt).toContain("- Ne réponds RIEN d'autre que le contenu du CSV")
  })

  it('décrit chaque colonne propre au modèle', () => {
    // Oracle : l'IA doit trouver une consigne pour chaque colonne du CSV.
    expect(prompt).toContain("- Modèle d'opérations — obligatoire.")
    expect(prompt).toContain('- Description du modèle — optionnel.')
    // Et les colonnes d'opération, déléguées au module partagé.
    expect(prompt).toContain('- Opération — obligatoire.')
  })

  it('liste les modèles déjà en base, avec ou sans opérations', () => {
    // Oracle : l'IA doit savoir ce qui existe pour ne pas le recréer ; un
    // modèle sans opération se dit explicitement.
    expect(prompt).toContain(
      '\n\nModèles DÉJÀ enregistrés dans cette catégorie.',
    )
    expect(prompt).toContain(
      '- Entretien chaudière (opérations déjà définies : Nettoyer le brûleur, Contrôler la pression)',
    )
    expect(prompt).toContain('- Entretien VMC (aucune opération)')
  })

  it('n’ouvre aucun bloc « déjà enregistrés » quand la catégorie est vide', () => {
    // Oracle : parler de modèles existants quand il n'y en a aucun ferait
    // halluciner l'IA.
    const vierge = buildImportPrompt({
      categorieNom: 'CVC',
      refs,
      existants: [],
    })
    expect(vierge).not.toContain('DÉJÀ enregistrés')
    expect(vierge).not.toContain('aucune opération)')
    // Rien ne s'intercale : la dernière puce de colonnes touche directement
    // l'invitation à coller les données.
    expect(vierge).toContain(
      "- Description de l'opération — optionnel. Précisions sur le mode opératoire.\n\nVoici les données brutes",
    )
  })

  it('aère le prompt : chaque bloc est précédé d’une ligne vide, et le collage suit sur une ligne neuve', () => {
    // Oracle : les blocs sont séparés par une ligne VIDE, et le prompt se
    // termine par un saut de ligne pour que les données collées à la suite ne
    // se mélangent pas au texte.
    expect(prompt).toContain("\n\nUn modèle d'opérations est")
    expect(prompt).toContain('\n\nCatégorie ciblée :')
    expect(prompt).toContain('\n\nFormat EXACT attendu :')
    expect(prompt).toContain('\n\nColonnes :')
    expect(prompt).toContain('\n\nVoici les données brutes à convertir')
    expect(prompt.endsWith('\n')).toBe(true)
  })
})
