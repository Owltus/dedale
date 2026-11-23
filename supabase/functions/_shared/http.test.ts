import { assertEquals } from 'jsr:@std/assert@1'
import { CORS_HEADERS, json } from './http.ts'

Deno.test('json : statut, corps et en-têtes CORS figés', async () => {
  const r = json({ a: 1 }, 400)
  assertEquals(r.status, 400)
  assertEquals(await r.text(), '{"a":1}')
  assertEquals(Object.fromEntries(r.headers.entries()), {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'content-type': 'application/json',
  })
})

Deno.test('json : statut 200 par défaut', () => {
  assertEquals(json({ ok: true }).status, 200)
})

Deno.test('CORS_HEADERS : trois en-têtes exacts', () => {
  assertEquals(CORS_HEADERS, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
})
