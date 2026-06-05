// Edge Function `invite_user` (Deno) — invitation de nouveaux comptes Dédale.
//
// S'exécute côté serveur avec le `service_role` (la SEULE clé secrète, jamais
// exposée au front). Le runtime Edge injecte automatiquement les variables
// d'environnement SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_ANON_KEY.
//
// Rôle de la fonction :
//   1. Authentifie l'appelant via son JWT (header Authorization).
//   2. Vérifie qu'il a le droit d'inviter et de créer le rôle demandé (cascade).
//   3. Délègue l'invitation à auth.admin.inviteUserByEmail, en posant les
//      métadonnées dans app_metadata (raw_app_meta_data côté Postgres). Le
//      trigger handle_new_auth_user crée alors public.users + user_sites et
//      re-valide la cascade côté base (défense en profondeur).
//
// Le corps attendu (JSON) : { email, role, nom_complet, site_ids: string[] }.
// `created_by` n'est PAS lu du body : il est dérivé du JWT de l'appelant (on ne
// fait jamais confiance au client pour l'identité de l'inviteur).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ROLES_VALIDES = [
  'admin',
  'manager',
  'technicien',
  'lecteur',
  'demandeur',
] as const
type RoleCode = (typeof ROLES_VALIDES)[number]

// Matrice de cascade — DOIT rester alignée avec handle_new_auth_user (la base
// re-valide de toute façon). admin → tous ; manager → tech/lecteur/demandeur ;
// technicien → lecteur/demandeur ; lecteur/demandeur → rien.
const CASCADE: Record<RoleCode, ReadonlyArray<RoleCode>> = {
  admin: ['admin', 'manager', 'technicien', 'lecteur', 'demandeur'],
  manager: ['technicien', 'lecteur', 'demandeur'],
  technicien: ['lecteur', 'demandeur'],
  lecteur: [],
  demandeur: [],
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

interface InviteBody {
  email: string
  role: string
  nom_complet: string
  site_ids: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Valide et normalise le corps de la requête. Renvoie un message d'erreur
// (string) si invalide, sinon les valeurs nettoyées.
function parseBody(
  raw: unknown,
): { error: string } | { value: InviteBody } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'Corps de requête JSON attendu.' }
  }
  const b = raw as Record<string, unknown>

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email)) {
    return { error: 'Adresse e-mail invalide.' }
  }

  const role = typeof b.role === 'string' ? b.role.trim() : ''
  if (!ROLES_VALIDES.includes(role as RoleCode)) {
    return {
      error: `Rôle invalide. Rôles valides : ${ROLES_VALIDES.join(', ')}.`,
    }
  }

  const nom_complet =
    typeof b.nom_complet === 'string' ? b.nom_complet.trim() : ''
  if (nom_complet.length === 0) {
    return { error: 'Le nom complet est obligatoire.' }
  }
  if (nom_complet.length > 200) {
    return { error: 'Le nom complet est trop long (200 caractères max).' }
  }

  let site_ids: string[] = []
  if (b.site_ids !== undefined && b.site_ids !== null) {
    if (!Array.isArray(b.site_ids)) {
      return { error: 'site_ids doit être un tableau d’identifiants.' }
    }
    site_ids = b.site_ids.map((s) => String(s).trim()).filter((s) => s !== '')
    if (site_ids.some((s) => !UUID_RE.test(s))) {
      return { error: 'site_ids contient un identifiant invalide.' }
    }
    // Dédoublonnage défensif (le trigger insère un user_sites par entrée).
    site_ids = [...new Set(site_ids)]
  }

  return { value: { email, role, nom_complet, site_ids } }
}

Deno.serve(async (req: Request): Promise<Response> => {
  // (a) Préflight CORS.
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

  // (b) JWT de l'appelant.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ error: 'Authentification requise.' }, 401)
  }

  // Corps JSON.
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return json({ error: 'Corps de requête JSON invalide.' }, 400)
  }
  const parsed = parseBody(rawBody)
  if ('error' in parsed) {
    return json({ error: parsed.error }, 400)
  }
  const { email, role, nom_complet, site_ids } = parsed.value

  // Client "appelant" : clé anon + JWT de l'utilisateur → soumis à la RLS et
  // à current_role(). Sert à identifier l'inviteur et lire son rôle réel.
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !userData.user) {
    return json({ error: 'Session invalide ou expirée.' }, 401)
  }
  const callerId = userData.user.id

  // Rôle réel de l'appelant via la RPC current_role() (lit la table users,
  // renvoie NULL si le compte est désactivé → kill-switch respecté).
  const { data: callerRole, error: roleErr } =
    await callerClient.rpc('current_role')
  if (roleErr) {
    return json({ error: 'Impossible de vérifier vos droits.' }, 403)
  }
  if (!callerRole || !ROLES_VALIDES.includes(callerRole as RoleCode)) {
    return json(
      { error: 'Compte sans rôle actif : invitation refusée.' },
      403,
    )
  }

  // (c) Validation de la cascade (1re ligne de défense ; la base re-valide).
  const allowed = CASCADE[callerRole as RoleCode]
  if (!allowed.includes(role as RoleCode)) {
    return json(
      {
        error: `Un compte « ${callerRole} » ne peut pas créer un compte « ${role} ».`,
      },
      403,
    )
  }

  // (d) Invitation via service_role. Les infos partent dans `data` (=
  // user_metadata), que GoTrue pose dès la création de l'utilisateur — et c'est
  // de là que le trigger handle_new_auth_user les lit (après la migration SQL
  // qui le fait lire user_metadata, avec app_metadata en priorité s'il existe).
  // inviteUserByEmail envoie aussi l'e-mail d'invitation.
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // URL de l'app vers laquelle revenir après le clic sur le lien d'invitation
  // (page où la personne définit son mot de passe). Configurable via le secret
  // APP_URL pour la prod ; défaut = dev local.
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5181'

  const { data: invited, error: inviteErr } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { role, nom_complet, created_by: callerId, site_ids },
      redirectTo: `${appUrl}/definir-mot-de-passe`,
    })

  if (inviteErr) {
    // Peut venir du trigger (cascade/scope sites refusés → rollback) ou d'Auth
    // (e-mail déjà utilisé, etc.). Message remonté tel quel (nos validations).
    const status =
      inviteErr.status && inviteErr.status >= 400 ? inviteErr.status : 400
    return json({ error: inviteErr.message }, status)
  }

  return json(
    {
      success: true,
      user: { id: invited.user?.id ?? null, email },
      message: `Invitation envoyée à ${email}.`,
    },
    200,
  )
})
