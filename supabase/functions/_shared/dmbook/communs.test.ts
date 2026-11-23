import { assertEquals } from 'jsr:@std/assert@1'
import { lireCommun } from './communs.ts'

Deno.test('ascenseur → cage d’ascenseur (les deux orthographes)', () => {
  assertEquals(lireCommun('ascenseur en panne'), { nom: "Cage d'ascenseur" })
  assertEquals(lireCommun('ASCENCEUR bloqué au 3ème'), { nom: "Cage d'ascenseur" })
})
