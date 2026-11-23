import { assertEquals } from 'jsr:@std/assert@1'
import { chargeJeton, jetonDeConnecteur } from './connecteur.ts'

// Fabrique un faux JWT (signature non vérifiée) dont la charge utile est
// encodée en base64url, sans remplissage, comme le fait Supabase Auth.
function faux(charge: unknown): string {
  const b64url = btoa(JSON.stringify(charge)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `entete.${b64url}.signature`
}

Deno.test('jetonDeConnecteur : charge avec client_id → true', () => {
  assertEquals(jetonDeConnecteur(faux({ sub: 'x', client_id: 'claude' })), true)
})

Deno.test('jetonDeConnecteur : charge sans client_id → false', () => {
  assertEquals(jetonDeConnecteur(faux({ sub: 'x', role: 'authenticated' })), false)
})

Deno.test('jetonDeConnecteur : charge base64url avec - et _ décodée', () => {
  // « ~~~ » et « ??? » produisent des « + » et « / » en base64 standard.
  assertEquals(jetonDeConnecteur(faux({ a: '~~~???', client_id: 'c' })), true)
})

Deno.test('jetonDeConnecteur : jeton illisible → false', () => {
  assertEquals(jetonDeConnecteur('pas-un-jeton'), false)
  assertEquals(jetonDeConnecteur('a.%%%.b'), false)
  assertEquals(jetonDeConnecteur(''), false)
})

Deno.test('jetonDeConnecteur : charge null ou non objet → false', () => {
  assertEquals(jetonDeConnecteur(faux(null)), false)
  assertEquals(jetonDeConnecteur(faux('client_id')), false)
})

Deno.test('chargeJeton : charge lisible rendue telle quelle, illisible → {}', () => {
  assertEquals(chargeJeton(faux({ client_id: 'claude', n: 1 })), { client_id: 'claude', n: 1 })
  assertEquals(chargeJeton('pas-un-jeton'), {})
  assertEquals(chargeJeton('a.%%%.b'), {})
})
