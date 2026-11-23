// Gel du préambule commun aux trois fonctions de comptes (invite_user,
// set_user_password, update_user_email) : méthode, configuration, jeton,
// connecteur et corps JSON. Chaque fonction est importée avec un faux
// `Deno.serve` qui capture son gestionnaire ; aucun appel réseau n'est fait,
// car toutes ces réponses tombent avant la création du moindre client.

import { assertEquals } from 'jsr:@std/assert@1'
import { REFUS_CONNECTEUR } from './connecteur.ts'
import { CORS_HEADERS } from './http.ts'

type Gestionnaire = (req: Request) => Promise<Response>

const ENV = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'cle-service',
  SUPABASE_ANON_KEY: 'cle-anon',
}
for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v)

async function charger(chemin: string): Promise<Gestionnaire> {
  const serveOrigine = Deno.serve
  let capture: Gestionnaire | null = null
  ;(Deno as unknown as { serve: unknown }).serve = (h: Gestionnaire) => {
    capture = h
  }
  try {
    await import(chemin)
  } finally {
    ;(Deno as unknown as { serve: unknown }).serve = serveOrigine
  }
  if (capture === null) throw new Error(`Aucun gestionnaire pour ${chemin}`)
  return capture
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const JETON_CONNECTEUR = `${b64url('{"alg":"none"}')}.${b64url('{"client_id":"claude","sub":"x"}')}.sig`
const JETON_ORDINAIRE = `${b64url('{"alg":"none"}')}.${b64url('{"sub":"x"}')}.sig`

function post(corps: string | null, jeton: string | null = JETON_ORDINAIRE): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jeton !== null) headers.Authorization = `Bearer ${jeton}`
  return new Request('http://localhost/f', { method: 'POST', headers, body: corps })
}

async function lire(r: Response): Promise<[number, unknown]> {
  const texte = await r.text()
  return [r.status, r.headers.get('content-type') === 'application/json' ? JSON.parse(texte) : texte]
}

const FONCTIONS = {
  invite_user: { chemin: '../invite_user/index.ts', tableau: 'Adresse e-mail invalide.' },
  set_user_password: { chemin: '../set_user_password/index.ts', tableau: 'user_id invalide.' },
  update_user_email: { chemin: '../update_user_email/index.ts', tableau: 'user_id invalide.' },
}

for (const [nom, { chemin, tableau }] of Object.entries(FONCTIONS)) {
  Deno.test(`${nom} : préambule figé`, async () => {
    const h = await charger(chemin)

    const options = await h(new Request('http://localhost/f', { method: 'OPTIONS' }))
    assertEquals(options.status, 200)
    assertEquals(await options.text(), 'ok')
    assertEquals(options.headers.get('access-control-allow-methods'), CORS_HEADERS['Access-Control-Allow-Methods'])

    assertEquals(await lire(await h(new Request('http://localhost/f', { method: 'GET' }))), [
      405,
      { error: 'Méthode non autorisée.' },
    ])

    Deno.env.delete('SUPABASE_ANON_KEY')
    try {
      assertEquals(await lire(await h(post('{}'))), [500, { error: 'Configuration serveur incomplète.' }])
    } finally {
      Deno.env.set('SUPABASE_ANON_KEY', ENV.SUPABASE_ANON_KEY)
    }

    assertEquals(await lire(await h(post('{}', null))), [401, { error: 'Authentification requise.' }])
    assertEquals(await lire(await h(post('{}', JETON_CONNECTEUR))), [403, { error: REFUS_CONNECTEUR }])
    assertEquals(await lire(await h(post('{pas du json'))), [400, { error: 'Corps de requête JSON invalide.' }])
    assertEquals(await lire(await h(post('42'))), [400, { error: 'Corps de requête JSON attendu.' }])
    assertEquals(await lire(await h(post('null'))), [400, { error: 'Corps de requête JSON attendu.' }])
    // Un tableau JSON passe le contrôle « objet » (typeof [] === 'object') : le
    // refus vient ensuite de la validation propre à chaque fonction.
    assertEquals(await lire(await h(post('[]'))), [400, { error: tableau }])
  })
}
