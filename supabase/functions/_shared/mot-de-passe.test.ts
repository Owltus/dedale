import { assertEquals } from 'jsr:@std/assert@1'
import { erreurMotDePasse } from './mot-de-passe.ts'

Deno.test('erreurMotDePasse : mot de passe valide → null', () => {
  assertEquals(erreurMotDePasse('Abcdefghij1!'), null)
  assertEquals(erreurMotDePasse('Éléphant-rose9'), null)
})

Deno.test('erreurMotDePasse : trop court (12 caractères au minimum)', () => {
  assertEquals(
    erreurMotDePasse('Abc1!'),
    'Le mot de passe doit faire au moins 12 caractères.',
  )
  assertEquals(
    erreurMotDePasse(''),
    'Le mot de passe doit faire au moins 12 caractères.',
  )
})

Deno.test('erreurMotDePasse : trop long, mesuré en octets', () => {
  assertEquals(
    erreurMotDePasse('Aa1!' + 'x'.repeat(69)),
    'Mot de passe trop long (72 octets au maximum).',
  )
  // 19 emoji = 76 octets pour 38 unités UTF-16.
  assertEquals(
    erreurMotDePasse('😀'.repeat(19)),
    'Mot de passe trop long (72 octets au maximum).',
  )
  assertEquals(erreurMotDePasse('Aa1!' + 'x'.repeat(68)), null)
})

Deno.test('erreurMotDePasse : classes manquantes, dans l’ordre', () => {
  // 18 emoji = 72 octets : accepté côté longueur, refusé sur les classes.
  assertEquals(
    erreurMotDePasse('😀'.repeat(18)),
    'Le mot de passe doit contenir une majuscule, une minuscule, un chiffre.',
  )
  assertEquals(
    erreurMotDePasse('abcdefghijkl'),
    'Le mot de passe doit contenir une majuscule, un chiffre, un caractère spécial.',
  )
  assertEquals(
    erreurMotDePasse('ABCDEFGHIJKL'),
    'Le mot de passe doit contenir une minuscule, un chiffre, un caractère spécial.',
  )
  assertEquals(
    erreurMotDePasse('Abcdefghijkl'),
    'Le mot de passe doit contenir un chiffre, un caractère spécial.',
  )
  assertEquals(
    erreurMotDePasse('Abcdefghijk!'),
    'Le mot de passe doit contenir un chiffre.',
  )
})
