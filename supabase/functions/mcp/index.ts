// Edge Function `mcp` (Deno) — connecteur Claude pour Dédale (lecture seule).
//
// Claude se branche ici comme « connecteur personnalisé » (protocole MCP,
// transport HTTP « streamable », réponses JSON, sans état).
//
// ─── SÉCURITÉ : LE JETON DE LA PERSONNE, RIEN D'AUTRE ───────────────────────
//
// 1. Aucune clé maître : chaque appel crée un client Supabase avec la clé
//    PUBLIQUE et le jeton reçu. La RLS juge, exactement comme dans l'appli.
// 2. Seuls les jetons émis par le serveur OAuth de Supabase Auth à un client
//    (claim `client_id`) sont acceptés. Un jeton de l'application est refusé :
//    sans `client_id`, la base ne saurait pas que l'appel vient de Claude et
//    le verrou « Accès Claude » (153) ne s'appliquerait pas.
// 3. Verrou « Accès Claude » : tenu par la BASE (153). Ici, on ne fait que le
//    lire pour afficher un message clair au lieu de listes vides.
// 4. Pas de SQL libre : des outils nommés, paramètres validés (./outils.ts).
// 5. Jamais de fichier : la base refuse Storage au connecteur (153) et aucun
//    outil ne renvoie de chemin de stockage.
//
// Déploiement : `npx supabase functions deploy mcp --no-verify-jwt`.
// `--no-verify-jwt` est voulu : sans jeton, Claude doit recevoir NOTRE 401
// (avec l'adresse des métadonnées OAuth) pour lancer la connexion. Le jeton
// est vérifié ci-dessous, auprès de Supabase Auth.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { OUTILS, executerOutil, type Contexte } from './outils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const RESSOURCE = `${SUPABASE_URL}/functions/v1/mcp`
const METADONNEES = `${RESSOURCE}/.well-known/oauth-protected-resource`
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'www-authenticate',
}

function json(corps: unknown, statut = 200, entetes: Record<string, string> = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json', ...entetes },
  })
}

function nonAutorise(message: string) {
  return json({ error: 'invalid_token', error_description: message }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${METADONNEES}"`,
  })
}

/** Lit la charge utile d'un JWT (déjà validé par Supabase Auth). */
function charge(jeton: string): Record<string, unknown> {
  try {
    const b64 = jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')))
  } catch {
    return {}
  }
}

const INSTRUCTIONS = `Dédale est la GMAO (maintenance) de l'établissement. Tu agis avec les droits de la personne connectée : tu ne vois que ses sites. Ce connecteur est en LECTURE SEULE pour l'instant et ne donne jamais accès aux fichiers (PDF, images), seulement à leurs noms.
Vocabulaire : OT = ordre de travail ; « Plan de maintenance » = les gammes ; DI = demande d'intervention ; un OT « programmé » est généré automatiquement, « planifié » a été placé par une personne. Un OT est en retard quand sa date prévue plus sa tolérance est dépassée et qu'il n'est ni clôturé ni annulé.
Réponds en français, avec les dates au format JJ/MM/AAAA et leur numéro de semaine.`

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

async function traiter(m: Message, ctx: Contexte): Promise<unknown | null> {
  const id = m.id ?? null
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const ko = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

  // Notification (pas d'id) : rien à répondre.
  if (m.id === undefined) return null

  switch (m.method) {
    case 'initialize': {
      const demandee = String(m.params?.protocolVersion ?? '')
      return ok({
        protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'dedale', title: 'Dédale', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: OUTILS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) })
    case 'tools/call': {
      const nom = String(m.params?.name ?? '')
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>
      return ok(await executerOutil(nom, args, ctx))
    }
    default:
      return ko(-32601, `Méthode inconnue : ${m.method ?? '(aucune)'}`)
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Métadonnées de ressource protégée (RFC 9728) : où se connecter.
  if (url.pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return json({
      resource: RESSOURCE,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'Dédale',
    })
  }

  const entete = req.headers.get('Authorization') ?? ''
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : ''
  if (!jeton) return nonAutorise('Connexion à Dédale requise.')

  // Pas de flux SSE côté serveur : uniquement des réponses JSON.
  if (req.method !== 'POST') return json({ error: 'Méthode non prise en charge' }, 405, { Allow: 'POST' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: qui, error: erreurJeton } = await supabase.auth.getUser(jeton)
  if (erreurJeton || !qui.user) return nonAutorise('Jeton invalide ou expiré.')
  const claims = charge(jeton)
  if (typeof claims.client_id !== 'string' || claims.client_id === '')
    return nonAutorise('Seuls les jetons émis au connecteur sont acceptés.')

  let corps: unknown
  try {
    corps = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } }, 400)
  }

  const ctx: Contexte = { supabase, userId: qui.user.id }
  if (Array.isArray(corps)) {
    const reponses = (await Promise.all(corps.map((m) => traiter(m as Message, ctx)))).filter((r) => r !== null)
    return reponses.length ? json(reponses) : new Response(null, { status: 202, headers: CORS })
  }
  const reponse = await traiter(corps as Message, ctx)
  return reponse === null ? new Response(null, { status: 202, headers: CORS }) : json(reponse)
})
