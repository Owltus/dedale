import { assertEquals } from 'jsr:@std/assert@1'
import { caracteristiques, CHAMPS_MAX, gabarit, lireChamps, nomEquipement, valeurTexte } from './caracteristiques.ts'

const champ = (type: string, extra: Record<string, unknown> = {}) => ({ cle: 'C', type, ...extra })

Deno.test('lireChamps : format { champs } et ancien format plat ; jamais d’exception', () => {
  assertEquals(lireChamps({ champs: [{ cle: 'A', type: 'texte', valeur: 'x' }, { pas: 'un champ' }] }).length, 1)
  assertEquals(lireChamps({ Marque: 'Acme', Vide: { objet: true } }), [
    { cle: 'Marque', type: 'texte', valeur: 'Acme' },
    { cle: 'Vide', type: 'texte', valeur: null },
  ])
  for (const x of [null, undefined, 'texte', 3, [1, 2]]) assertEquals(lireChamps(x), [])
})

Deno.test('valeurTexte : même rendu que l’appli (formatChampValeur)', () => {
  assertEquals(valeurTexte(champ('nombre', { unite: 'kW' }), 2.5), '2.5 kW')
  assertEquals(valeurTexte(champ('oui-non'), true), 'Oui')
  assertEquals(valeurTexte(champ('oui-non'), false), 'Non')
  assertEquals(valeurTexte(champ('date'), '2026-01-15'), '15/01/2026 (S3)')
  assertEquals(valeurTexte(champ('double-reference', { libelleB: 'Point' }), { a: '3', b: '12' }), '3 / Point 12')
  assertEquals(valeurTexte(champ('double-reference'), { a: '3', b: '12' }), '3/12')
  assertEquals(valeurTexte(champ('double-reference'), { a: ' ', b: '' }), null)
  assertEquals(valeurTexte(champ('texte'), ''), null)
  assertEquals(valeurTexte(champ('texte'), null), null)
  assertEquals(valeurTexte(champ('texte'), 'x'.repeat(500))?.length, 200)
})

Deno.test('caracteristiques : libellé → valeur, champs vides omis, plafond', () => {
  assertEquals(
    caracteristiques({
      champs: [
        { cle: 'Repère', type: 'texte', valeur: 'Chambre 214' },
        { cle: 'Vide', type: 'texte', valeur: null },
        { cle: 'Puissance', type: 'nombre', unite: 'kW', valeur: 3 },
      ],
    }),
    { Repère: 'Chambre 214', Puissance: '3 kW' },
  )
  const beaucoup = { champs: Array.from({ length: 100 }, (_, i) => ({ cle: `C${i}`, type: 'texte', valeur: 'v' })) }
  assertEquals(Object.keys(caracteristiques(beaucoup)).length, CHAMPS_MAX)
})

Deno.test('gabarit : type en clair, unité, choix, parts, défaut, obligatoire', () => {
  assertEquals(
    gabarit({
      champs: [
        { cle: 'Puissance', type: 'nombre', unite: 'kW', requis: false, defaut: 2.5 },
        { cle: 'Marque', type: 'liste', options: ['Acme', 'Bolt'], requis: true, defaut: null },
        { cle: 'Adresse', type: 'double-reference', libelleA: 'Zone', libelleB: '', requis: false, defaut: null },
      ],
    }),
    [
      { libelle: 'Puissance', type: 'Nombre', unite: 'kW', requis: false, defaut: '2.5 kW' },
      { libelle: 'Marque', type: 'Liste', options: ['Acme', 'Bolt'], requis: true },
      { libelle: 'Adresse', type: 'Double référence', parts: ['Zone', '2de part'], requis: false },
    ],
  )
})

Deno.test('nomEquipement : flotte + valeur principale · secondaire · tertiaire (nomAfficheTexte)', () => {
  const specs = {
    champs: [
      { cle: 'Repère', type: 'texte', valeur: 'Chambre 214' },
      { cle: 'Techno', type: 'liste', valeur: 'Optique' },
    ],
  }
  assertEquals(
    nomEquipement({
      sous_categorie: 'Détecteur',
      specifications: specs,
      valeur_principale: 'Repère',
      valeur_secondaire: 'Techno',
      valeur_tertiaire: 'Absent',
    }),
    'Détecteur Chambre 214 · Optique',
  )
  assertEquals(nomEquipement({ sous_categorie: 'Détecteur', specifications: specs }), 'Détecteur')
  assertEquals(nomEquipement({ sous_categorie: null, specifications: null }), 'Équipement')
})
