// Edge Function `update_user_email` (Deno) — lecture / changement de l'e-mail
// d'un utilisateur. L'e-mail vit dans auth.users (pas dans public.users), donc
// inaccessible au front : on passe par le service_role côté serveur.
//
// Réservé aux ADMINS (l'e-mail est une donnée sensible). Corps JSON :
//   { user_id }          → lecture : renvoie { email } de l'utilisateur cible.
//   { user_id, email }   → mise à jour de l'e-mail (confirmé d'office).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, lireAppel } from '../_shared/http.ts'
import type { Database } from '../_shared/database.types.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request): Promise<Response> => {
  // Préflight, méthode, configuration, jeton, connecteur et corps JSON.
  const appel = await lireAppel(req)
  if (appel instanceof Response) return appel
  const { token, corps: b, url, anonKey, serviceRoleKey } = appel

  const userId = typeof b.user_id === 'string' ? b.user_id.trim() : ''
  if (!UUID_RE.test(userId)) {
    return json({ error: 'user_id invalide.' }, 400)
  }
  const hasEmail = typeof b.email === 'string' && b.email.trim() !== ''
  const email = hasEmail ? (b.email as string).trim().toLowerCase() : ''
  if (hasEmail && !EMAIL_RE.test(email)) {
    return json({ error: 'Adresse e-mail invalide.' }, 400)
  }

  // L'appelant doit être admin (rôle réel lu via current_role, respecte le
  // kill-switch est_actif).
  const callerClient = createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: callerRole, error: roleErr } =
    await callerClient.rpc('current_role')
  if (roleErr) {
    return json({ error: 'Impossible de vérifier vos droits.' }, 403)
  }
  if (callerRole !== 'admin') {
    return json({ error: 'Action réservée aux administrateurs.' }, 403)
  }

  const adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Lecture seule (pas d'email fourni).
  if (!hasEmail) {
    const { data, error } = await adminClient.auth.admin.getUserById(userId)
    if (error) {
      return json({ error: error.message }, 400)
    }
    return json({ email: data.user?.email ?? null }, 200)
  }

  // Mise à jour de l'e-mail (confirmé immédiatement : l'admin atteste).
  const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  })
  if (error) {
    const status = error.status && error.status >= 400 ? error.status : 400
    return json({ error: error.message }, status)
  }
  return json({ email: data.user?.email ?? email, success: true }, 200)
})
