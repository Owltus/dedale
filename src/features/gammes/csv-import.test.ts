import { describe, expect, it } from 'vitest'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type GammeCsvRowOk,
  type GammeExistante,
  type PeriodiciteRef,
} from './csv-import'
import type { OperationRefs } from '@/features/operations/csv-import'

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
