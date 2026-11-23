import { assertEquals } from 'jsr:@std/assert@1'
import { Locaux } from '../_shared/dmbook/lieux.ts'
import { apresEchec, ECHECS_MAX, type Ligne, lireNiveau, regrouper, texteVoulu } from './envoyer.ts'

const locaux = new Locaux([
  { id: 'c112', nom: 'Chambre 112', niveau: 'R+1' },
  { id: 'c114', nom: 'Chambre 114', niveau: 'R+1' },
  { id: 'club', nom: 'Club', niveau: 'RDC' },
])
const ligne = (id: number, di_id: string | null, action: string, dmbook_id: string | null = null): Ligne =>
  ({ id, di_id, dmbook_id, action, tentatives: 0 })

Deno.test('niveau d\'écriture : « aucune » par défaut, même pour une valeur inconnue', () => {
  assertEquals([lireNiveau(undefined), lireNiveau(''), lireNiveau('TOUT'), lireNiveau('test'), lireNiveau('toutes')],
    ['aucune', 'aucune', 'aucune', 'test', 'toutes'])
})

Deno.test('regroupement : texte + statut d\'une même demande partent ensemble, dans l\'ordre de la file', () => {
  const g = regrouper([ligne(1, 'a', 'texte'), ligne(2, 'b', 'statut'), ligne(3, 'a', 'statut')])
  assertEquals(g.map((x) => [x.di_id, [...x.actions], x.lignes.map((l) => l.id)]), [['a', ['texte', 'statut'], [1, 3]], ['b', ['statut'], [2]]])
})

Deno.test('regroupement : une suppression l\'emporte, une création porte l\'état complet', () => {
  const g = regrouper([ligne(1, 'a', 'texte'), ligne(2, 'a', 'supprimer', '77'), ligne(3, 'b', 'creer'), ligne(4, 'b', 'statut')])
  assertEquals(g.map((x) => [[...x.actions], x.dmbook_id, x.lignes.length]), [[['supprimer'], '77', 2], [['creer'], null, 2]])
})

Deno.test('regroupement : suppression d\'une demande déjà effacée (sans di_id) gardée à part', () => {
  const g = regrouper([ligne(1, null, 'supprimer', '77'), ligne(2, null, 'supprimer', '78')])
  assertEquals(g.map((x) => x.dmbook_id), ['77', '78'])
})

Deno.test('texte : seule la chambre change → le texte Dmbook est gardé, seule la tête bouge (D9)', () => {
  assertEquals(texteVoulu('#112 Ampoule grillée //AB', 'Ampoule grillée', ['114'], locaux), '#114 Ampoule grillée //AB')
})

Deno.test('texte : constat modifié dans Dédale → texte recomposé « #chambre constat » (D8)', () => {
  assertEquals(texteVoulu('#112 Ampoule grillée //AB', 'Ampoule et douille grillées', ['112'], locaux), '#112 Ampoule et douille grillées')
})

Deno.test('texte : chambre retirée, demande sans lieu → constat seul', () => {
  assertEquals(texteVoulu('#112 Ampoule grillée', 'Ampoule grillée', [], locaux), 'Ampoule grillée')
})

Deno.test(`échec : nouvel essai, puis mise de côté au ${ECHECS_MAX}e`, () => {
  assertEquals(apresEchec(0), { tentatives: 1, issue: null })
  assertEquals(apresEchec(ECHECS_MAX - 1), { tentatives: ECHECS_MAX, issue: 'mis_de_cote' })
})
