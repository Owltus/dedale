import { assertEquals } from 'jsr:@std/assert@1'
import { masquer } from './serveur.ts'

Deno.test('boîte du code masquée : assez pour savoir qui prévenir, pas plus', () => {
  assertEquals(masquer('jean.dupont@exemple.fr'), 'j…@exemple.fr')
  assertEquals(masquer('identifiant'), 'i…')
})
