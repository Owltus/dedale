// Edge Function `invite_user` (Deno) — création de comptes Dédale.
//
// NOM TROMPEUR, ASSUMÉ : cette fonction n'invite plus, elle CRÉE directement le
// compte avec son mot de passe. Le renommer imposerait de déployer la nouvelle
// fonction avant le front puis de supprimer l'ancienne après, sous peine de
// coupure — pour un gain nul. C'est une dette de nommage, pas un oubli.
//
// S'exécute côté serveur avec le `service_role` (la SEULE clé secrète, jamais
// exposée au front). Le runtime Edge injecte automatiquement les variables
// d'environnement SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_ANON_KEY.
//
// Rôle de la fonction :
//   1. Authentifie l'appelant via son JWT (header Authorization).
//   2. Vérifie qu'il a le droit de créer le rôle demandé (cascade).
//   3. Valide le mot de passe (voir piège 3 ci-dessous).
//   4. Crée le compte via auth.admin.createUser, en posant les métadonnées dans
//      user_metadata. Le trigger handle_new_auth_user crée alors public.users +
//      user_sites et re-valide la cascade côté base (défense en profondeur).
//
// Le corps attendu (JSON) : { email, password, role, nom_complet, site_ids[] }.
// `created_by` n'est PAS lu du body : il est dérivé du JWT de l'appelant (on ne
// fait jamais confiance au client pour l'identité de l'inviteur).
//
// AUCUN E-MAIL N'EST ENVOYÉ. `adminUserCreate` ne référence aucun mailer, à la
// différence de `inviteUserByEmail` (qui en envoie toujours un) et de `/signup`.
//
// ─── TROIS PIÈGES À NE JAMAIS REDÉCOUVRIR ───────────────────────────────────
//
// 1. `email_confirm: true` est OBLIGATOIRE. Sans lui, GoTrue refuse la connexion
//    (erreur `email_not_confirmed`) — et comme aucun e-mail n'est parti, la
//    personne n'a AUCUN moyen de se débloquer : le compte est mort-né.
//    Désactiver « Confirm email » dans le dashboard n'y change rien, ce réglage
//    n'agit que sur /signup.
//
// 2. `role` doit rester DANS `user_metadata`, jamais à la racine de createUser.
//    À la racine, `role` est un champ réservé qui écrit le rôle Postgres du JWT :
//    le compte perdrait son claim `authenticated` et toute la RLS casserait. Le
//    piège est d'autant plus facile que `role` est une variable en scope ici.
//
// 3. GoTrue NE VALIDE PAS le mot de passe à la création. Son contrôle de
//    robustesse n'est appelé qu'à la modification, jamais dans adminUserCreate.
//    La politique de mot de passe du projet Supabase est donc SANS EFFET ici :
//    c'est `parseBody` ci-dessous qui fait autorité. Sans elle, un compte au mot
//    de passe « a » serait accepté — et se verrait refuser la connexion plus
//    tard si la politique projet était durcie.

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
  password: string
  role: string
  nom_complet: string
  site_ids: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Règles de mot de passe ─────────────────────────────────────────────────
// MIROIR EXACT de PASSWORD_REGLES (src/features/utilisateurs/schemas.ts). Les
// deux listes doivent rester alignées : le front guide la saisie, celle-ci
// décide. Voir le piège 3 en tête de fichier.
const PASSWORD_REGLES: ReadonlyArray<{ libelle: string; test: RegExp | null }> =
  [
    { libelle: 'une majuscule', test: /[A-ZÀ-Ý]/ },
    { libelle: 'une minuscule', test: /[a-zà-ÿ]/ },
    { libelle: 'un chiffre', test: /[0-9]/ },
    { libelle: 'un caractère spécial', test: /[^A-Za-zÀ-ÿ0-9]/ },
  ]

const PASSWORD_MIN = 12
// En OCTETS et non en caractères : bcrypt tronque au-delà de 72 octets, et un
// mot de passe d'emoji atteint la limite dès 18 caractères.
const PASSWORD_OCTETS_MAX = 72

/** Message d'erreur si le mot de passe est refusé, `null` s'il est accepté. */
function erreurMotDePasse(v: string): string | null {
  if (v.length < PASSWORD_MIN) {
    return `Le mot de passe doit faire au moins ${String(PASSWORD_MIN)} caractères.`
  }
  if (new TextEncoder().encode(v).length > PASSWORD_OCTETS_MAX) {
    return `Mot de passe trop long (${String(PASSWORD_OCTETS_MAX)} octets au maximum).`
  }
  const manquantes = PASSWORD_REGLES.filter(
    (r) => r.test !== null && !r.test.test(v),
  ).map((r) => r.libelle)
  if (manquantes.length > 0) {
    return `Le mot de passe doit contenir ${manquantes.join(', ')}.`
  }
  return null
}

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

  // NI trim NI toLowerCase, contrairement à l'e-mail : une espace de tête ou de
  // fin est un caractère légitime d'un mot de passe, et la retirer enregistrerait
  // autre chose que ce que la personne a saisi.
  const password = typeof b.password === 'string' ? b.password : ''
  const erreurPwd = erreurMotDePasse(password)
  if (erreurPwd !== null) {
    return { error: erreurPwd }
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

  return { value: { email, password, role, nom_complet, site_ids } }
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
  const { email, password, role, nom_complet, site_ids } = parsed.value

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
      { error: 'Compte sans rôle actif : création refusée.' },
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

  // (d) Création via service_role. Les métadonnées partent dans `user_metadata`,
  // que GoTrue pose dès l'INSERT — et c'est de là que le trigger
  // handle_new_auth_user les lit (app_metadata reste prioritaire s'il existe).
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: created, error: createErr } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      // Piège 1 (voir en-tête) : sans ceci, le compte ne peut JAMAIS se
      // connecter, et aucun e-mail n'existe pour le débloquer.
      email_confirm: true,
      // Piège 2 (voir en-tête) : `role` reste ICI. À la racine de createUser, il
      // écraserait le rôle Postgres du JWT et casserait la RLS.
      user_metadata: { role, nom_complet, created_by: callerId, site_ids },
    })

  if (createErr) {
    const status =
      createErr.status && createErr.status >= 400 ? createErr.status : 400

    // Une exception du trigger (cascade ou scope de sites refusés) fait rollback
    // de la transaction, et GoTrue la convertit en « Database error creating new
    // user » — un 500 opaque dont le message métier ne sort jamais. On le
    // traduit plutôt que d'afficher un texte anglais brut : le cas courant est
    // déjà intercepté plus haut par la cascade, il ne reste ici que le scope des
    // sites et l'imprévu.
    const message = /database error/i.test(createErr.message)
      ? 'La création a été refusée par la base. Vérifiez le rôle et les sites choisis.'
      : createErr.message

    return json({ error: message }, status)
  }

  // Le mot de passe n'est JAMAIS renvoyé, ni journalisé. Les clés `success`,
  // `user.id` et `user.email` sont consommées par le front : ne pas les changer.
  return json(
    {
      success: true,
      user: { id: created.user?.id ?? null, email },
      message: `Compte créé pour ${email}.`,
    },
    200,
  )
})
