import { describe, expect, it } from 'vitest'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ModeleOperationCsvRowOk,
  type ModeleOperationExistant,
} from './csv-import'
import type { OperationRefs } from '@/features/operations/csv-import'

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
