// En-têtes CORS et réponse JSON communs aux Edge Functions de comptes
// (invite_user, set_user_password, update_user_email) et à dmbook-connexion.
// `mcp` a son propre CORS : il reste à part. `lireAppel` ne sert qu'aux trois
// fonctions de comptes.

import { jetonDeConnecteur, REFUS_CONNECTEUR } from './connecteur.ts'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** Ce que `lireAppel` rend quand l'appel a passé le préambule. */
export interface Appel {
  token: string
  /** Objet JSON non nul (un tableau passe : `typeof [] === 'object'`). */
  corps: Record<string, unknown>
  url: string
  anonKey: string
  serviceRoleKey: string
}

/**
 * Préambule commun aux fonctions de comptes, dans cet ordre exact : préflight
 * OPTIONS, 405 hors POST, 500 si une variable d'environnement manque, 401 sans
 * jeton, 403 pour un jeton de connecteur, 400 si le JSON est illisible ou n'est
 * pas un objet. Rend la `Response` de refus, ou l'appel lu.
 *
 * Le jeton n'est PAS vérifié ici (pas de `getUser()`) : chaque fonction le fait
 * elle-même au besoin (`update_user_email` s'en remet à `current_role`).
 */
export async function lireAppel(req: Request): Promise<Response | Appel> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée.' }, 405)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !serviceRoleKey || !anonKey) {
    // Mauvaise configuration serveur — ne JAMAIS détailler quelles clés manquent.
    return json({ error: 'Configuration serveur incomplète.' }, 500)
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ error: 'Authentification requise.' }, 401)
  }
  // 162 : jamais depuis le connecteur Claude (clé de service = hors RLS et hors garde).
  if (jetonDeConnecteur(token)) {
    return json({ error: REFUS_CONNECTEUR }, 403)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Corps de requête JSON invalide.' }, 400)
  }
  if (typeof raw !== 'object' || raw === null) {
    return json({ error: 'Corps de requête JSON attendu.' }, 400)
  }

  return { token, corps: raw as Record<string, unknown>, url, anonKey, serviceRoleKey }
}
