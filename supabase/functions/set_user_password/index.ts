// Edge Function `set_user_password` (Deno) — redéfinit le mot de passe d'un
// AUTRE utilisateur. Le front ne peut pas le faire : `auth.updateUser` n'agit
// que sur sa propre session. Seul le service_role peut agir sur un tiers.
//
// Remplace l'ancien envoi de lien de réinitialisation par e-mail (ADR 0007).
//
// Corps JSON : { user_id, password }.
//
// QUI A LE DROIT (décision PO du 17/08/2026) :
//   - un ADMIN : sur n'importe quel compte, sauf le sien ;
//   - un MANAGER : uniquement sur un technicien / lecteur / demandeur qui
//     partage un de ses sites.
//
// L'AUTO-MODIFICATION EST INTERDITE par cette voie, pour les deux rôles. On
// change son propre mot de passe depuis son profil, ce qui exige de connaître
// l'ancien. Sans ce garde-fou, un administrateur contournerait cette exigence
// sur son propre compte — et quiconque emprunterait une session ouverte aussi.
//
// PIÈGE : contrairement à `createUser`, `updateUserById` applique bien la
// politique de mot de passe du projet Supabase. On valide quand même ici, parce
// que nos règles sont plus strictes et que les messages doivent être en français.

import { createClient } from 'jsr:@supabase/supabase-js@2'

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// MIROIR EXACT de PASSWORD_REGLES (src/features/utilisateurs/schemas.ts) et de
// la validation de `invite_user`. Les trois listes doivent rester alignées.
const PASSWORD_REGLES: ReadonlyArray<{ libelle: string; test: RegExp }> = [
  { libelle: 'une majuscule', test: /[A-ZÀ-Ý]/ },
  { libelle: 'une minuscule', test: /[a-zà-ÿ]/ },
  { libelle: 'un chiffre', test: /[0-9]/ },
  { libelle: 'un caractère spécial', test: /[^A-Za-zÀ-ÿ0-9]/ },
]

const PASSWORD_MIN = 12
// En OCTETS et non en caractères : bcrypt tronque au-delà de 72 octets.
const PASSWORD_OCTETS_MAX = 72

/** Message d'erreur si le mot de passe est refusé, `null` s'il est accepté. */
function erreurMotDePasse(v: string): string | null {
  if (v.length < PASSWORD_MIN) {
    return `Le mot de passe doit faire au moins ${String(PASSWORD_MIN)} caractères.`
  }
  if (new TextEncoder().encode(v).length > PASSWORD_OCTETS_MAX) {
    return `Mot de passe trop long (${String(PASSWORD_OCTETS_MAX)} octets au maximum).`
  }
  const manquantes = PASSWORD_REGLES.filter((r) => !r.test.test(v)).map(
    (r) => r.libelle,
  )
  if (manquantes.length > 0) {
    return `Le mot de passe doit contenir ${manquantes.join(', ')}.`
  }
  return null
}

/** Rôles qu'un manager peut dépanner. Jamais un pair, jamais un admin. */
const CIBLES_MANAGER = ['technicien', 'lecteur', 'demandeur']

Deno.serve(async (req: Request): Promise<Response> => {
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
    return json({ error: 'Configuration serveur incomplète.' }, 500)
  }

  const token = (req.headers.get('Authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  if (!token) {
    return json({ error: 'Authentification requise.' }, 401)
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
  const b = raw as Record<string, unknown>

  const userId = typeof b.user_id === 'string' ? b.user_id.trim() : ''
  if (!UUID_RE.test(userId)) {
    return json({ error: 'user_id invalide.' }, 400)
  }

  // NI trim NI toLowerCase : une espace est un caractère de mot de passe.
  const password = typeof b.password === 'string' ? b.password : ''
  const erreurPwd = erreurMotDePasse(password)
  if (erreurPwd !== null) {
    return json({ error: erreurPwd }, 400)
  }

  // Client de l'APPELANT : clé anon + son JWT, donc soumis à la RLS et à
  // current_role() — c'est ce qui porte le kill-switch `est_actif`. Ne jamais
  // basculer ces vérifications sur le client service_role.
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !userData.user) {
    return json({ error: 'Session invalide ou expirée.' }, 401)
  }
  const callerId = userData.user.id

  if (callerId === userId) {
    return json(
      {
        error:
          'Pour changer votre propre mot de passe, passez par votre profil.',
      },
      403,
    )
  }

  const { data: callerRole, error: roleErr } =
    await callerClient.rpc('current_role')
  if (roleErr) {
    return json({ error: 'Impossible de vérifier vos droits.' }, 403)
  }
  if (callerRole !== 'admin' && callerRole !== 'manager') {
    return json({ error: 'Action réservée aux administrateurs et managers.' }, 403)
  }

  // Le manager ne dépanne que ses subordonnés, sur ses sites. La lecture passe
  // par le client de l'APPELANT : la RLS de `users` ne lui montre déjà que les
  // comptes de son périmètre, donc une cible hors périmètre remonte introuvable.
  if (callerRole === 'manager') {
    const { data: cible, error: cibleErr } = await callerClient
      .from('users')
      .select('id, roles(code)')
      .eq('id', userId)
      .maybeSingle()

    if (cibleErr) {
      return json({ error: 'Impossible de vérifier ce compte.' }, 403)
    }
    if (!cible) {
      return json({ error: 'Ce compte n’est pas dans votre périmètre.' }, 403)
    }

    const roles = (cible as { roles?: { code?: string } | null }).roles
    const codeCible = roles?.code ?? ''
    if (!CIBLES_MANAGER.includes(codeCible)) {
      return json(
        {
          error: `Un manager ne peut pas redéfinir le mot de passe d’un compte « ${codeCible} ».`,
        },
        403,
      )
    }

    // Ceinture et bretelles : la RLS filtre déjà par site partagé, mais on le
    // vérifie explicitement — la policy pourrait évoluer sans qu'on y pense.
    // Nom du paramètre vérifié dans schema_complete.sql:793 — `target_user_id`,
    // pas `p_user_id` comme le laisserait croire la convention des autres RPC.
    const { data: partage, error: partageErr } = await callerClient.rpc(
      'shares_site_with',
      { target_user_id: userId },
    )
    if (partageErr || partage !== true) {
      return json({ error: 'Ce compte n’est pas dans votre périmètre.' }, 403)
    }
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password,
  })
  if (error) {
    const status = error.status && error.status >= 400 ? error.status : 400
    return json({ error: error.message }, status)
  }

  // Le mot de passe n'est jamais renvoyé ni journalisé.
  return json({ success: true }, 200)
})
