import { assertEquals } from 'jsr:@std/assert@1'
import { changerChambres, composer } from './composer.ts'
import { analyser, chambresEnTete, Locaux } from './lieux.ts'

const locaux = new Locaux([
  ...['112', '114', '301', '307', '405'].map((c, i) => ({ id: `ch${i}`, nom: `Chambre ${c}`, niveau: `R+${c[0]}` })),
  { id: 'cuisine', nom: 'Cuisine Club', niveau: 'RDC' },
])

Deno.test('création : une chambre → « #112 constat »', () => {
  assertEquals(composer('Réparer nuage LED', ['112']), '#112 Réparer nuage LED')
})
Deno.test('création : plusieurs chambres', () => {
  assertEquals(composer('Ampoules tête de lit hs', ['301', '307']), '#301 #307 Ampoules tête de lit hs')
})
Deno.test('création : local non chambre → constat seul', () => {
  assertEquals(composer('Four en panne', []), 'Four en panne')
})
Deno.test('changement de chambre : tête « #112 » remplacée, signature gardée', () => {
  assertEquals(changerChambres('#112 nuage LED HS //AB', ['114']), '#114 nuage LED HS //AB')
})
Deno.test('changement de chambre : écritures variées de la tête', () => {
  assertEquals(changerChambres('112 - bonde bloquée', ['114']), '#114 bonde bloquée')
  assertEquals(changerChambres('# 112 / 405 odeur', ['114']), '#114 odeur')
  assertEquals(changerChambres('#403 #404 odeur', ['301']), '#301 odeur')
})
Deno.test('changement de chambre : chambre citée au milieu → on ajoute en tête sans toucher la phrase', () => {
  assertEquals(
    changerChambres('Sèche-cheveux remplacé par celui de #110', ['112']),
    '#112 Sèche-cheveux remplacé par celui de #110',
  )
})
Deno.test('chambre retirée sans remplacement → tête retirée', () => {
  assertEquals(changerChambres('#112 - nuage LED', []), 'nuage LED')
})
Deno.test("pas de faux positif : une mesure en tête n'est pas une chambre", () => {
  assertEquals(changerChambres('110 degrés au sauna', ['112']), '#112 110 degrés au sauna')
})
Deno.test('aller-retour : le texte composé redonne les mêmes chambres et le même constat', () => {
  for (
    const [constat, ch] of [['Réparer nuage LED', ['112']], ['Rideau décroché', ['301', '307']], [
      'Four en panne',
      [],
    ]] as const
  ) {
    const t = composer(constat, [...ch])
    assertEquals(chambresEnTete(t), [...ch])
    const a = analyser(t, locaux)
    assertEquals(a.chambres, [...ch])
    assertEquals(a.constat, constat)
  }
})
Deno.test('analyser : citation ambiguë → aucun lieu', () => {
  assertEquals(analyser('Clés de sécu à encoder pour la 112 et 114', locaux).lieux, [])
})
Deno.test('analyser : texte réduit à un numéro → « Sans description »', () => {
  assertEquals(analyser('#515', locaux).constat, 'Sans description')
})
Deno.test('analyser : partie commune', () => {
  assertEquals(analyser('Four en panne en cuisine', locaux).lieux, ['cuisine'])
})
