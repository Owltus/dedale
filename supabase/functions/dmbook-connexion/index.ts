// Edge Function `dmbook-connexion` — connexion de Dédale à Dmbook, pilotée depuis l'application.
// Plan sync-dmbook, étapes 3a / 8a (migration 163). Décisions PO D7 et D15.
//
// Deux gestes, réservés aux admin / manager / technicien du site lié à Dmbook :
//   { action: 'connecter' }      UNE tentative de connexion, seulement si Dédale
//                                n'est pas connecté (jamais_connecte / erreur).
//                                Dmbook peut alors envoyer un code par e-mail.
//   { action: 'code', code }     envoie le code UNE fois, seulement si Dmbook l'attend.
//
// Garde-fous : jamais de « renvoyer le code » ; un verrou empêche deux gestes
// simultanés (deux personnes qui cliquent en même temps) ; un jeton du
// connecteur Claude est refusé ; la session et les identifiants ne quittent
// jamais le serveur. La réponse ne contient que l'état et un message.
//
// Déploiement : `npx supabase functions deploy dmbook-connexion --project-ref ybxuojtyevldrbieaykh`
// (vérification du jeton par la passerelle : laissée active).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { jetonDeConnecteur, REFUS_CONNECTEUR } from '../_shared/connecteur.ts'
import { clientServeur, lireEtat, prendreVerrou, rendreVerrou, seConnecter, validerCode } from '../_shared/dmbook/serveur.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } })

const CODE_RE = /^[A-Za-z0-9]{4,12}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const jeton = auth.replace(/^Bearer\s+/i, '')
  if (!jeton) return json({ error: 'Connexion à Dédale requise.' }, 401)
  if (jetonDeConnecteur(jeton)) return json({ error: REFUS_CONNECTEUR }, 403)

  let corps: { action?: unknown; code?: unknown }
  try {
    corps = await req.json()
  } catch {
    return json({ error: 'Corps de requête JSON attendu.' }, 400)
  }
  const action = corps.action
  if (action !== 'connecter' && action !== 'code') return json({ error: 'Action inconnue.' }, 400)
  const code = typeof corps.code === 'string' ? corps.code.replace(/\s+/g, '') : ''
  if (action === 'code' && !CODE_RE.test(code)) return json({ error: 'Le code doit faire de 4 à 12 chiffres ou lettres.' }, 400)

  // Droit : la base décide (rôle + site), avec le jeton de la personne.
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const personne = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: visible, error: refus } = await personne.rpc('dmbook_etat_public')
  if (refus) return json({ error: 'Connexion à Dédale requise.' }, 401)
  if (!Array.isArray(visible) || visible.length === 0)
    return json({ error: 'Réservé aux administrateurs, managers et techniciens du site.' }, 403)

  const sb = clientServeur()
  if (!(await prendreVerrou(sb, 120)))
    return json({ error: 'Une connexion à Dmbook est déjà en cours. Patiente une minute.' }, 409)
  try {
    const etat = await lireEtat(sb)
    if (action === 'connecter') {
      if (etat.etat === 'code_requis') return json({ error: 'Dmbook attend déjà un code : saisis celui reçu par e-mail.' }, 409)
      if (etat.etat === 'ok') return json({ error: 'Dédale est déjà connecté à Dmbook.' }, 409)
      if (etat.etat === 'pause') return json({ error: 'La synchro Dmbook est en pause.' }, 409)
      return json(await seConnecter(sb, etat))
    }
    if (etat.etat !== 'code_requis') return json({ error: 'Dmbook n’attend pas de code en ce moment.' }, 409)
    return json(await validerCode(sb, etat, code))
  } catch (e) {
    console.error('[dmbook-connexion]', e instanceof Error ? e.message : e)
    return json({ error: 'Erreur du serveur pendant la connexion à Dmbook.' }, 500)
  } finally {
    await rendreVerrou(sb)
  }
})
