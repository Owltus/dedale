import { describe, expect, it } from 'vitest'
import {
  buildImportPrompt,
  construirePlan,
  parseImportCsv,
  resumePlan,
  type ModeleEquipementCsvRowOk,
  type ModeleEquipementExistant,
} from './csv-import'

const ENTETE =
  'Modèle;Description du modèle;Caractéristique;Type;Unité;Valeurs possibles;Obligatoire;Valeur par défaut'

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
})
