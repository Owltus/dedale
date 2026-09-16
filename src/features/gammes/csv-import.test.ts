import { describe, expect, it } from 'vitest'
import {
  CSV_DELIMITER,
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type GammeCsvRowOk,
  type GammeExistante,
  type PeriodiciteRef,
  type PlanImportGammes,
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
  unites: [{ id: 2, nom: 'Pourcentage', symbole: '%', necessite_seuils: true }],
}
const periodicites: PeriodiciteRef[] = [
  { id: 9, libelle: 'Annuel', jours_periodicite: 365 },
  { id: 8, libelle: 'Semestriel', jours_periodicite: 180 },
]

const ENTETE =
  "Gamme;Nature;Périodicité;Description de la gamme;Opération;Ordre;Type d'opération;Unité;Seuil minimum;Seuil maximum;Description de l'opération"

const existants: GammeExistante[] = [
  {
    id: 'g1',
    nom: 'Vérification extincteurs',
    operations: ['Contrôler la goupille'],
  },
]

const ok = (lignes: ReturnType<typeof parseImportCsv>['lignes']) =>
  lignes.filter((l): l is GammeCsvRowOk => l.ok)

describe('parseImportCsv (plan de maintenance)', () => {
  it('exige gamme, nature, périodicité et opération dans l’en-tête', () => {
    const r = parseImportCsv('Colonne;Autre\nx;y', refs, periodicites)
    expect(r.colonnesManquantes).toEqual([
      'Gamme',
      'Nature',
      'Périodicité',
      'Opération',
    ])
  })

  it('lit nature et périodicité sur la première ligne seulement', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Contrôle RIA;Réglementaire;Annuel;Contrôle réglementaire;Vérifier la pression;1;Mesure;%;80;100;',
        'Contrôle RIA;;;;Vérifier la signalisation;2;Vérification;;;;',
      ].join('\n'),
      refs,
      periodicites,
    )
    const lignes = ok(r.lignes)
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({
      gamme: 'Contrôle RIA',
      nature: 'controle_reglementaire',
      periodiciteId: 9,
      description: 'Contrôle réglementaire',
    })
    // Deuxième ligne : ni nature ni périodicité à répéter.
    expect(lignes[1]?.nature).toBeUndefined()
    expect(lignes[1]?.periodiciteId).toBeUndefined()
  })

  it('refuse une nature ou une périodicité hors référentiel', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Gamme A;Bizarre;Annuel;;Faire;;Vérification;;;;',
        'Gamme B;Maintenance;Tous les jeudis;;Faire;;Vérification;;;;',
      ].join('\n'),
      refs,
      periodicites,
    )
    const messages = r.lignes.flatMap((l) => (l.ok ? [] : l.erreurs)).join(' ')
    expect(messages).toContain('Nature « Bizarre » inconnue')
    expect(messages).toContain('Périodicité « Tous les jeudis » inconnue')
  })

  it('accepte une gamme sans opération détaillée', () => {
    const r = parseImportCsv(
      [ENTETE, 'Nettoyage gaines;Maintenance;Semestriel;;;;;;;;'].join('\n'),
      refs,
      periodicites,
    )
    const [ligne] = ok(r.lignes)
    expect(ligne?.operation).toBeNull()
    expect(ligne?.periodiciteId).toBe(8)
  })

  it('n’exige ni nature ni périodicité pour compléter une gamme existante', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Vérification extincteurs;;;;Vérifier la pesée;;Vérification;;;;',
        'Vérification extincteurs;;;;Contrôler la goupille;;Vérification;;;;',
      ].join('\n'),
      refs,
      periodicites,
      existants,
    )
    expect(ok(r.lignes)).toHaveLength(1)
    // La seconde est déjà en base : ignorée, pas en erreur.
    expect(r.lignes[1]?.ok === false && r.lignes[1].ignoree).toBe(true)
  })
})

describe('construirePlan (plan de maintenance)', () => {
  it('crée les gammes nouvelles et complète les existantes', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Vérification extincteurs;;;;Vérifier la pesée;;Vérification;;;;',
        'Contrôle RIA;Réglementaire;Annuel;;Vérifier la pression;;Mesure;%;80;100;',
      ].join('\n'),
      refs,
      periodicites,
      existants,
    )
    const plan = construirePlan(ok(r.lignes), existants)
    expect(plan.nbCreations).toBe(1)
    expect(plan.nbCompletions).toBe(1)
    expect(plan.nbOperations).toBe(2)

    const ria = plan.gammes.find((g) => g.nom === 'Contrôle RIA')
    expect(ria).toMatchObject({
      existantId: null,
      nature: 'controle_reglementaire',
      periodiciteId: 9,
    })
    expect(resumePlan(plan)).toContain('2 opérations')
  })
})

describe('buildImportPrompt (plan de maintenance)', () => {
  it('énumère natures, périodicités et gammes déjà en place', () => {
    const prompt = buildImportPrompt({
      sousCategorieNom: 'Incendie',
      refs,
      periodicites,
      existants,
    })
    expect(prompt).toContain('« Incendie »')
    expect(prompt).toContain('« Réglementaire »')
    expect(prompt).toContain('« Semestriel »')
    expect(prompt).toContain('opérations déjà définies : Contrôler la goupille')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Durcissement Martin : gestion d'erreur et cas limites. Un import CSV
// transforme un collage non fiable en lignes de base ; ce qui compte n'est pas
// le cas nominal mais ce que l'utilisateur voit quand son collage est faux.
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
  parseImportCsv([ENTETE, ...lignes].join('\n'), refs, periodicites)

describe('parseImportCsv — en-tête et forme du collage', () => {
  it('un collage vide n’est pas un défaut de colonnes', () => {
    // Oracle : l'utilisateur qui n'a rien collé n'a pas un en-tête fautif ; on
    // ne lui reproche rien et on ne propose aucune ligne.
    for (const vide of ['', '\n', '   \n  ']) {
      const r = parseImportCsv(vide, refs, periodicites)
      expect(r.colonnesManquantes).toEqual([])
      expect(r.lignes).toEqual([])
    }
  })

  it('un en-tête incomplet ne laisse passer AUCUNE ligne', () => {
    // Oracle : tant qu'une colonne obligatoire manque, on ne devine pas — on
    // n'affiche pas d'aperçu partiel qui laisserait croire à un import possible.
    const r = parseImportCsv(
      'Colonne;Autre\nGamme A;Réglementaire',
      refs,
      periodicites,
    )
    expect(r.colonnesManquantes).toHaveLength(4)
    expect(r.lignes).toEqual([])
  })

  it('accepte un en-tête dans le DÉSORDRE et privé de ses colonnes optionnelles', () => {
    // Oracle : seul le NOM d'une colonne compte, jamais sa position ; une
    // colonne optionnelle absente vaut cellule vide, pas erreur.
    const r = parseImportCsv(
      [
        "Gamme;Opération;Nature;Périodicité;Type d'opération",
        'Contrôle RIA;  Vérifier la pression  ;Réglementaire;Annuel;Vérification',
      ].join('\n'),
      refs,
      periodicites,
    )
    expect(r.colonnesManquantes).toEqual([])
    const [ligne] = ok(r.lignes)
    expect(ligne?.operation?.values).toMatchObject({
      nom: 'Vérifier la pression',
      ordre: '',
      description: '',
    })
    expect(ligne?.description).toBeUndefined()
  })

  it('une ligne plus courte que l’en-tête vaut « cellules de fin vides »', () => {
    // Oracle : un collage tronqué à droite (colonnes de fin omises) est un cas
    // courant ; il ne doit pas fabriquer de valeurs.
    const r = lire('Nettoyage gaines;Maintenance;Semestriel')
    const [ligne] = ok(r.lignes)
    expect(ligne).toMatchObject({
      gamme: 'Nettoyage gaines',
      nature: 'maintenance_preventive',
      periodiciteId: 8,
    })
    expect(ligne?.operation).toBeNull()
    expect(ligne?.description).toBeUndefined()
  })

  it('numérote les lignes comme l’utilisateur les voit, l’en-tête comptant pour 1', () => {
    // Oracle : le numéro rapporté sert à retrouver la ligne dans le collage ;
    // la première ligne de données est donc la n° 2.
    const r = lire(
      'Gamme A;Réglementaire;Annuel;;Faire;;Vérification;;;;',
      'Gamme B;Maintenance;Semestriel;;Faire;;Vérification;;;;',
      ';Maintenance;Annuel;;Faire;;Vérification;;;;',
    )
    expect(r.lignes.map((l) => l.ligne)).toEqual([2, 3, 4])
    expect(r.lignes[2]?.ok).toBe(false)
  })

  it('rapporte colonnesManquantes VIDE quand l’en-tête est complet', () => {
    // Oracle : « aucune colonne manquante » est une information, pas un détail.
    const r = lire('Gamme A;Maintenance;Annuel;;Faire;;Vérification;;;;')
    expect(r.colonnesManquantes).toEqual([])
  })
})

describe('parseImportCsv — la gamme elle-même', () => {
  it('réclame le nom de la gamme, et RIEN d’autre sur une ligne anonyme', () => {
    // Oracle : une erreur nomme sa colonne. Et on ne reproche pas la nature
    // manquante d'une gamme qui n'a pas encore de nom : une seule erreur utile.
    const r = lire(';;;;Faire le tour;;Vérification;;;;')
    expect(erreursLigne(r, 0)).toEqual(['Gamme est obligatoire.'])
  })

  it('borne le nom à 200 caractères INCLUS', () => {
    // Oracle : la colonne `gammes.nom` est un varchar(200) — 200 passe, 201 non.
    const r = lire(
      `${'G'.repeat(200)};Maintenance;Annuel;;Faire;;Vérification;;;;`,
      `${'G'.repeat(201)};Maintenance;Annuel;;Faire;;Vérification;;;;`,
    )
    expect(r.lignes[0]?.ok).toBe(true)
    expect(erreursLigne(r, 1)).toEqual(['Gamme dépasse 200 caractères.'])
  })

  it('rogne les espaces autour du nom et de la description', () => {
    // Oracle : un collage depuis un tableur traîne des espaces ; ce n'est pas
    // à l'utilisateur de les enlever, et ils ne doivent pas partir en base.
    const r = lire(
      '  Contrôle RIA  ;Réglementaire;Annuel;  Contrôle annuel  ;;;;;;;',
    )
    const [ligne] = ok(r.lignes)
    expect(ligne?.gamme).toBe('Contrôle RIA')
    expect(ligne?.description).toBe('Contrôle annuel')
  })

  it('réclame nature ET périodicité sur la première ligne d’une gamme nouvelle', () => {
    // Oracle : les deux manques sont signalés ensemble (on ne fait pas corriger
    // l'utilisateur deux fois), et chaque message nomme sa colonne.
    const r = lire('Gamme A;;;;Faire;;Vérification;;;;')
    expect(erreursLigne(r, 0)).toEqual([
      "Nature est obligatoire sur la première ligne d'une gamme.",
      "Périodicité est obligatoire sur la première ligne d'une gamme.",
    ])
  })

  it('énumère les valeurs admises quand la nature ou la périodicité est inconnue', () => {
    // Oracle : « inconnue » ne suffit pas — le message doit citer la valeur
    // fautive ET la liste exacte des valeurs acceptées.
    const r = lire(
      'Gamme A;Bizarre;Annuel;;Faire;;Vérification;;;;',
      'Gamme B;Maintenance;Tous les jeudis;;Faire;;Vérification;;;;',
    )
    expect(erreursLigne(r, 0)).toEqual([
      'Nature « Bizarre » inconnue (valeurs possibles : Réglementaire, Maintenance).',
    ])
    expect(erreursLigne(r, 1)).toEqual([
      'Périodicité « Tous les jeudis » inconnue (valeurs possibles : Annuel, Semestriel).',
    ])
  })

  it('accepte la nature par son libellé OU par sa valeur stockée, sans égard à la casse', () => {
    // Oracle : `resoudreNature` admet les deux écritures ; une IA qui recopie
    // la valeur technique ne doit pas faire échouer l'import.
    const r = lire(
      'Gamme A;  réglementaire  ;Annuel;;Faire;;Vérification;;;;',
      'Gamme B;controle_reglementaire;Annuel;;Faire;;Vérification;;;;',
      'Gamme C;MAINTENANCE;Annuel;;Faire;;Vérification;;;;',
    )
    const lignes = ok(r.lignes)
    expect(lignes).toHaveLength(3)
    expect(lignes.map((l) => l.nature)).toEqual([
      'controle_reglementaire',
      'controle_reglementaire',
      'maintenance_preventive',
    ])
  })

  it('ne duplique pas une gamme pour une différence de casse ou d’espaces', () => {
    // Oracle : « VÉRIFICATION EXTINCTEURS » EST la gamme « Vérification
    // extincteurs » déjà en base — sinon l'import recrée un doublon.
    const r = parseImportCsv(
      [
        ENTETE,
        'VÉRIFICATION EXTINCTEURS;;;;Vérifier la pesée;;Vérification;;;;',
        '  Vérification Extincteurs  ;;;;  CONTRÔLER LA GOUPILLE  ;;Vérification;;;;',
      ].join('\n'),
      refs,
      periodicites,
      existants,
    )
    // La gamme est reconnue malgré la casse : ni nature ni périodicité ne sont
    // réclamées (on ne retouche pas une gamme existante), et l'opération déjà
    // en base est ignorée — pas dupliquée.
    expect(ok(r.lignes)).toHaveLength(1)
    expect(r.lignes[0]).toMatchObject({
      ok: true,
      gamme: 'VÉRIFICATION EXTINCTEURS',
    })
    expect(r.lignes[1]).toMatchObject({ ok: false, ignoree: true })
  })
})

describe('parseImportCsv — ligne « gamme seule » et colonnes d’opération', () => {
  it('traite une cellule Opération blanche comme vide', () => {
    // Oracle : «   » n'est pas un libellé d'opération.
    const r = lire('Nettoyage gaines;Maintenance;Semestriel;;   ;;;;;;')
    const [ligne] = ok(r.lignes)
    expect(ligne?.operation).toBeNull()
  })

  it('refuse TOUTES les colonnes d’opération remplies sans opération, en les nommant', () => {
    // Oracle : une ligne sans libellé d'opération ne peut pas porter d'ordre,
    // de type, d'unité ni de seuils ; le message liste les colonnes fautives
    // dans l'ordre de l'en-tête et accorde son verbe au pluriel.
    const r = lire('Gamme A;Maintenance;Annuel;;;1;Vérification;%;2;5;')
    expect(erreursLigne(r, 0)).toEqual([
      "Ordre, Type d'opération, Unité, Seuil minimum, Seuil maximum ne s'appliquent qu'à une opération — Opération est vide.",
    ])
  })

  it('accorde le verbe au singulier pour une seule colonne fautive', () => {
    // Oracle : « ne s'applique » / « ne s'appliquent » — l'accord suit le
    // nombre de colonnes citées.
    const r = lire('Gamme A;Maintenance;Annuel;;;7;;;;;')
    expect(erreursLigne(r, 0)).toEqual([
      "Ordre ne s'applique qu'à une opération — Opération est vide.",
    ])
  })

  // ORACLE : le prompt d'import annonce « une gamme sans opération détaillée
  // s'écrit sur une seule ligne, avec Opération et les colonnes suivantes
  // vides ». Une cellule remplie dans ce bloc est donc une erreur de saisie, et
  // doit être signalée en nommant la colonne fautive.
  //
  // Régression couverte : le garde `remplies` ne contrôlait que 5 des 6
  // colonnes d'opération — la description n'y figurait pas. Sur une ligne
  // « gamme seule », `resoudreOperation` n'est jamais appelée : la ligne était
  // acceptée et le texte saisi disparaissait SANS un mot.
  it('signale une description d’opération posée sur une ligne sans opération', () => {
    const r = lire('Gamme A;Maintenance;Annuel;;;;;;;;Purger avant contrôle')
    expect(erreursLigne(r, 0)).toEqual([
      "Description de l'opération ne s'applique qu'à une opération — Opération est vide.",
    ])
  })

  it('ne considère pas comme « remplie » une colonne d’opération blanche', () => {
    // Oracle : des espaces laissés par le tableur dans les colonnes d'opération
    // ne doivent pas refuser une ligne « gamme seule » parfaitement valide.
    const r = lire('Gamme A;Maintenance;Annuel;;;  ;  ;  ;  ;  ;  ')
    expect(ok(r.lignes)).toHaveLength(1)
    expect(ok(r.lignes)[0]?.operation).toBeNull()
  })

  it('remonte telles quelles les erreurs de l’opération', () => {
    // Oracle : le module de gamme ne réécrit pas les diagnostics d'opération —
    // il les recopie, sinon l'utilisateur ne sait pas quelle cellule corriger.
    const r = lire('Gamme A;Maintenance;Annuel;;Vérifier;;Bricolage;;;;')
    expect(erreursLigne(r, 0)).toEqual([
      "Type d'opération « Bricolage » inconnu (valeurs possibles : Vérification, Mesure).",
    ])
  })
})

describe('parseImportCsv — doublons d’opérations', () => {
  it('ignore un doublon apparu DANS le collage, pour une gamme nouvelle', () => {
    // Oracle : la déduplication vaut aussi entre deux lignes du CSV, pas
    // seulement face à la base — et elle ignore la casse et les espaces.
    const r = lire(
      'Gamme A;Maintenance;Annuel;;Faire le tour;;Vérification;;;;',
      'Gamme A;;;;  FAIRE LE TOUR  ;;Vérification;;;;',
    )
    expect(ok(r.lignes)).toHaveLength(1)
    expect(r.lignes[1]).toMatchObject({
      ok: false,
      ignoree: true,
      erreurs: [
        '« FAIRE LE TOUR » est déjà une opération de « Gamme A » — ligne ignorée.',
      ],
    })
  })

  it('nomme l’opération ET la gamme dans le message d’une ligne ignorée', () => {
    // Oracle : une ligne écartée doit dire POURQUOI, en citant les deux noms.
    const r = parseImportCsv(
      [
        ENTETE,
        'Vérification extincteurs;;;;Contrôler la goupille;;Vérification;;;;',
      ].join('\n'),
      refs,
      periodicites,
      existants,
    )
    expect(erreursLigne(r, 0)).toEqual([
      '« Contrôler la goupille » est déjà une opération de « Vérification extincteurs » — ligne ignorée.',
    ])
  })

  it('n’ignore PAS la même opération portée par deux gammes différentes', () => {
    // Oracle : la déduplication est par gamme, pas globale.
    const r = lire(
      'Gamme A;Maintenance;Annuel;;Faire le tour;;Vérification;;;;',
      'Gamme B;Maintenance;Annuel;;Faire le tour;;Vérification;;;;',
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
  gamme: string,
  reste: Partial<Omit<GammeCsvRowOk, 'ok' | 'gamme'>> = {},
): GammeCsvRowOk => ({ ok: true, ligne: 2, gamme, operation: null, ...reste })

describe('construirePlan — regroupement par gamme', () => {
  it('rassemble les lignes d’une même gamme et garde les attributs de la PREMIÈRE', () => {
    // Oracle : nature, périodicité et description sont lues une seule fois, sur
    // la première ligne ; les lignes suivantes n'apportent que des opérations.
    const plan = construirePlan(
      [
        ligneOk('Contrôle RIA', {
          nature: 'controle_reglementaire',
          periodiciteId: 9,
          description: 'Contrôle annuel',
          operation: operation('Vérifier la pression'),
        }),
        ligneOk('Contrôle RIA', {
          nature: 'maintenance_preventive',
          periodiciteId: 8,
          description: 'Texte concurrent',
          operation: operation('Vérifier la signalisation'),
        }),
        ligneOk('Contrôle RIA'),
      ],
      [],
    )
    expect(plan.gammes).toHaveLength(1)
    expect(plan.gammes[0]).toMatchObject({
      nom: 'Contrôle RIA',
      existantId: null,
      nature: 'controle_reglementaire',
      periodiciteId: 9,
      description: 'Contrôle annuel',
    })
    // La ligne « gamme seule » n'ajoute AUCUNE opération.
    expect(plan.gammes[0]?.operations.map((o) => o.values.nom)).toEqual([
      'Vérifier la pression',
      'Vérifier la signalisation',
    ])
    expect(plan.nbOperations).toBe(2)
  })

  it('compte séparément créations, complétions et opérations', () => {
    // Oracle : une gamme À CRÉER n'a pas d'id ; une gamme À COMPLÉTER en a un
    // ET reçoit au moins une opération — une existante sans opération nouvelle
    // n'est ni l'un ni l'autre, il n'y a rien à écrire pour elle.
    const enBase: GammeExistante[] = [
      { id: 'g1', nom: 'Vérification extincteurs', operations: ['Peser'] },
      { id: 'g2', nom: 'Nettoyage gaines', operations: [] },
    ]
    const plan = construirePlan(
      [
        ligneOk('Neuve A', { operation: operation('a') }),
        ligneOk('Neuve B', { operation: operation('b') }),
        ligneOk('Neuve C', { operation: operation('c') }),
        ligneOk('vérification extincteurs', { operation: operation('d') }),
        ligneOk('  NETTOYAGE GAINES  '),
      ],
      enBase,
    )
    expect(plan.nbCreations).toBe(3)
    expect(plan.nbCompletions).toBe(1)
    expect(plan.nbOperations).toBe(4)
    // Le nom canonique de la base l'emporte sur la casse du collage ; une gamme
    // inconnue garde, elle, le nom écrit par l'utilisateur.
    expect(plan.gammes.map((g) => g.nom)).toEqual([
      'Neuve A',
      'Neuve B',
      'Neuve C',
      'Vérification extincteurs',
      'Nettoyage gaines',
    ])
    expect(plan.gammes.map((g) => g.existantId)).toEqual([
      null,
      null,
      null,
      'g1',
      'g2',
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
      gammes: [],
      nbCreations,
      nbCompletions,
      nbOperations,
    } satisfies PlanImportGammes)

  it('ne dit rien quand il n’y a rien à écrire', () => {
    // Oracle : zéro n'est pas une information — « 0 gamme à créer » est du bruit.
    expect(resume(0, 0, 0)).toBe('')
  })

  it('n’énumère que les compteurs non nuls', () => {
    // Oracle : chaque terme absent disparaît de la phrase, sans virgule
    // orpheline ni « et » pendant.
    expect(resume(1, 0, 0)).toBe('1 gamme à créer')
    expect(resume(0, 1, 0)).toBe('1 gamme à compléter')
    expect(resume(0, 0, 1)).toBe('1 opération')
  })

  it('accorde le pluriel à partir de 2', () => {
    // Oracle : en français, 1 reste au singulier et 2 passe au pluriel.
    expect(resume(2, 0, 0)).toBe('2 gammes à créer')
    expect(resume(0, 2, 0)).toBe('2 gammes à compléter')
    expect(resume(0, 0, 2)).toBe('2 opérations')
  })

  it('joint deux termes par « et »', () => {
    expect(resume(1, 1, 0)).toBe('1 gamme à créer et 1 gamme à compléter')
    expect(resume(1, 0, 3)).toBe('1 gamme à créer et 3 opérations')
    expect(resume(0, 2, 5)).toBe('2 gammes à compléter et 5 opérations')
  })

  it('joint trois termes par des virgules puis « et » devant le dernier', () => {
    // Oracle : « A, B et C » — la virgule sépare, « et » conclut.
    expect(resume(2, 1, 7)).toBe(
      '2 gammes à créer, 1 gamme à compléter et 7 opérations',
    )
  })
})

describe('buildImportPrompt — le prompt est le CONTRAT donné à l’IA', () => {
  const deuxGammes: GammeExistante[] = [
    {
      id: 'g1',
      nom: 'Vérification extincteurs',
      operations: ['Contrôler la goupille', 'Peser'],
    },
    { id: 'g2', nom: 'Nettoyage gaines', operations: [] },
  ]
  const prompt = buildImportPrompt({
    sousCategorieNom: 'Incendie',
    refs,
    periodicites,
    existants: deuxGammes,
  })

  it('annonce la tâche, l’objet métier et la sous-catégorie ciblée', () => {
    // Oracle : sans ces trois repères, l'IA ne sait ni quoi produire, ni pour
    // quel objet, ni où cela sera rangé.
    expect(prompt).toContain(
      'Tu vas produire un fichier CSV pour construire un PLAN DE MAINTENANCE',
    )
    expect(prompt).toContain('Une gamme est une intervention récurrente')
    expect(prompt).toContain('Sous-catégorie ciblée : « Incendie »')
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
      "- Une gamme sans opération détaillée s'écrit sur une seule ligne",
    )
    expect(prompt).toContain(
      '- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.',
    )
    expect(prompt).toContain("- Ne réponds RIEN d'autre que le contenu du CSV")
  })

  it('décrit chaque colonne propre à la gamme et recopie les référentiels', () => {
    // Oracle : le prompt énumère les valeurs EXACTES admises par le parseur —
    // toutes les natures, toutes les périodicités, dans l'ordre du référentiel.
    expect(prompt).toContain('- Gamme — obligatoire.')
    expect(prompt).toContain(
      'UNIQUEMENT une de ces valeurs : « Réglementaire », « Maintenance ».',
    )
    expect(prompt).toContain(
      'UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : « Annuel », « Semestriel ».',
    )
    expect(prompt).toContain('- Description de la gamme — optionnel.')
  })

  it('liste les gammes déjà en base, avec ou sans opérations', () => {
    // Oracle : l'IA doit savoir ce qui existe pour ne pas le recréer ; une
    // gamme sans opération se dit explicitement, pas par une parenthèse vide.
    expect(prompt).toContain(
      '\n\nGammes DÉJÀ enregistrées dans cette sous-catégorie.',
    )
    expect(prompt).toContain(
      '- Vérification extincteurs (opérations déjà définies : Contrôler la goupille, Peser)',
    )
    expect(prompt).toContain('- Nettoyage gaines (aucune opération)')
  })

  it('n’ouvre aucun bloc « déjà enregistrées » quand la sous-catégorie est vide', () => {
    // Oracle : parler de gammes existantes quand il n'y en a aucune ferait
    // halluciner l'IA.
    const vierge = buildImportPrompt({
      sousCategorieNom: 'Incendie',
      refs,
      periodicites,
      existants: [],
    })
    expect(vierge).not.toContain('DÉJÀ enregistrées')
    expect(vierge).not.toContain('aucune opération)')
    // Rien ne s'intercale : la dernière puce de colonnes touche directement
    // l'invitation à coller les données.
    expect(vierge).toContain(
      "- Description de l'opération — optionnel. Précisions sur le mode opératoire.\n\nVoici les données brutes",
    )
  })

  it('aère le prompt : chaque bloc est précédé d’une ligne vide, et le collage suit sur une ligne neuve', () => {
    // Oracle : le prompt est lu par une IA ET relu par un humain ; les blocs
    // sont séparés par une ligne VIDE, et il se termine par un saut de ligne
    // pour que les données collées à la suite ne se mélangent pas au texte.
    expect(prompt).toContain('\n\nUne gamme est une intervention')
    expect(prompt).toContain('\n\nSous-catégorie ciblée :')
    expect(prompt).toContain('\n\nFormat EXACT attendu :')
    expect(prompt).toContain('\n\nColonnes :')
    expect(prompt).toContain('\n\nVoici les données brutes à convertir')
    expect(prompt.endsWith('\n')).toBe(true)
  })
})
