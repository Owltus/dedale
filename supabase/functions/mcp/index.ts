// Edge Function `mcp` (Deno) — connecteur Claude pour Dédale (lecture + gestes encadrés sur les OT, les DI, les travaux, les événements, les lieux, la Bibliothèque de modèles et le parc d'équipements).
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
import { type Contexte, executerOutil, OUTILS } from './outils.ts'
import { INSTRUCTIONS } from './consignes.ts'
import { chargeJeton } from '../_shared/connecteur.ts'
import type { Database } from '../_shared/database.types.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
// Deux portes d'entrée, même connecteur :
// - directe : https://<projet>.supabase.co/functions/v1/mcp ;
// - publique : https://dedale.naostack.com/mcp, que Vercel relaie ici en
//   ajoutant le segment `/dedale` (vercel.json). Claude affiche alors l'icône
//   du site Dédale au lieu de celle de Supabase.
// La « ressource » annoncée doit être l'adresse que Claude a saisie : on la
// déduit de ce segment. Il ne donne aucun droit (seul le jeton en donne).
const SITE_DEDALE = 'https://dedale.naostack.com'
const RESSOURCE_DIRECTE = `${SUPABASE_URL}/functions/v1/mcp`
const RESSOURCE_PUBLIQUE = `${SITE_DEDALE}/mcp`
const viaDedale = (url: URL) => /\/mcp\/dedale(\/|$)/.test(url.pathname)
const ressource = (url: URL) => (viaDedale(url) ? RESSOURCE_PUBLIQUE : RESSOURCE_DIRECTE)
const metadonnees = (url: URL) => `${ressource(url)}/.well-known/oauth-protected-resource`
const ICONES = [
  { src: `${SITE_DEDALE}/favicon.png`, mimeType: 'image/png', sizes: ['189x189'] },
  { src: `${SITE_DEDALE}/logo.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
]
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'www-authenticate',
}

function json(corps: unknown, statut = 200, entetes: Record<string, string> = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json', ...entetes },
  })
}

function nonAutorise(url: URL, message: string) {
  return json({ error: 'invalid_token', error_description: message }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${metadonnees(url)}"`,
  })
}

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
        serverInfo: {
          name: 'dedale',
          title: 'Dédale',
          version: '1.0.0',
          icons: ICONES,
          websiteUrl: SITE_DEDALE,
        },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({
        tools: OUTILS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      })
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
      resource: ressource(url),
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'Dédale',
    })
  }

  const entete = req.headers.get('Authorization') ?? ''
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7).trim() : ''
  if (!jeton) return nonAutorise(url, 'Connexion à Dédale requise.')

  // Pas de flux SSE côté serveur : uniquement des réponses JSON.
  if (req.method !== 'POST') return json({ error: 'Méthode non prise en charge' }, 405, { Allow: 'POST' })

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: qui, error: erreurJeton } = await supabase.auth.getUser(jeton)
  if (erreurJeton || !qui.user) return nonAutorise(url, 'Jeton invalide ou expiré.')
  const claims = chargeJeton(jeton) // déjà validé par Supabase Auth
  if (typeof claims.client_id !== 'string' || claims.client_id === '') {
    return nonAutorise(url, 'Seuls les jetons émis au connecteur sont acceptés.')
  }

  // 162 : corps borné (256 Ko) et lots bornés (10 messages, traités un par un) :
  // un seul appel ne doit pas pouvoir lancer des milliers de requêtes en base.
  const texte = await req.text()
  if (texte.length > TAILLE_MAX) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Requête trop volumineuse' } }, 413)
  }
  let corps: unknown
  try {
    corps = JSON.parse(texte)
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } }, 400)
  }

  const ctx: Contexte = { supabase, userId: qui.user.id }
  if (Array.isArray(corps)) {
    if (corps.length === 0 || corps.length > LOT_MAX) {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `Lot de 1 à ${LOT_MAX} messages` } }, 400)
    }
    const reponses: unknown[] = []
    for (const m of corps) {
      const r = await traiterSansPlanter(m, ctx)
      if (r !== null) reponses.push(r)
    }
    return reponses.length ? json(reponses) : new Response(null, { status: 202, headers: CORS })
  }
  const reponse = await traiterSansPlanter(corps, ctx)
  return reponse === null ? new Response(null, { status: 202, headers: CORS }) : json(reponse)
})

const TAILLE_MAX = 256 * 1024
const LOT_MAX = 10

/** Un message mal formé ou une erreur imprévue donnent une erreur JSON-RPC, jamais un 500. */
async function traiterSansPlanter(m: unknown, ctx: Contexte): Promise<unknown | null> {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Message JSON-RPC invalide' } }
  }
  const message = m as Message
  try {
    return await traiter(message, ctx)
  } catch (e) {
    console.error('mcp', e)
    return { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32603, message: 'Erreur interne du connecteur' } }
  }
}
