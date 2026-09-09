import { describe, expect, it } from 'vitest'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ArbreExistant,
  type ContexteImport,
  type CsvImportRowOk,
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
})
