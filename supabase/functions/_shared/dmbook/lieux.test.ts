import { assertEquals } from 'jsr:@std/assert@1'
import { chambreDuNom, chambresEnTete, Locaux } from './lieux.ts'

Deno.test('Locaux : seul « Chambre NNN » exact devient une chambre', () => {
  const locaux = new Locaux([
    { id: 'a', nom: 'Chambre 112', niveau: 'R+1' },
    { id: 'b', nom: 'Chambre 1120', niveau: 'R+1' },
    { id: 'c', nom: 'chambre 113', niveau: 'R+1' },
    { id: 'd', nom: 'Hall', niveau: 'RDC' },
    { id: 'e', nom: 'Chambre 12', niveau: 'R+1' },
  ])
  assertEquals([...locaux.chambres.keys()], ['112'])
})

Deno.test('chambresEnTete : chambres de tête dans l’ordre, sans doublon (appels répétés stables)', () => {
  assertEquals(chambresEnTete('#403 #404 #403 odeur'), ['403', '404'])
  assertEquals(chambresEnTete('#403 #404 #403 odeur'), ['403', '404'])
  assertEquals(chambresEnTete('odeur en 403'), [])
})

Deno.test('chambreDuNom : « Chambre NNN » exact → numéro, sinon null', () => {
  assertEquals(chambreDuNom('Chambre 112'), '112')
  assertEquals(chambreDuNom('Chambre 1120'), null)
  assertEquals(chambreDuNom('chambre 113'), null)
  assertEquals(chambreDuNom('Hall'), null)
})
