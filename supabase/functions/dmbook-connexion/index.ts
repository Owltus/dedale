// Edge Function `dmbook-connexion` — connexion d'un site Dédale à son carnet Dmbook,
// réglée depuis l'application. Plan sync-dmbook, étapes 3b et 8a (migration 165).
// Décisions PO D7, D18-D20.
//
// Trois gestes, réservés à l'admin, au manager ou au technicien DU SITE (`dmbook_peut_regler`),
// toujours avec `site_id` :
//   { action: 'enregistrer', site_id, adresse, identifiant, mot_de_passe? }
//        adresse du carnet collée + identifiants Dmbook, rangés dans le coffre.
//        Mot de passe absent = on garde l'ancien. Rien n'est tenté chez Dmbook.
//   { action: 'connecter', site_id }   UNE tentative, seulement si le site n'est pas
//        connecté (jamais_connecte / erreur). Dmbook peut alors envoyer un code par e-mail.
//   { action: 'code', site_id, code }  envoie le code UNE fois, seulement si Dmbook l'attend.
//
// Garde-fous : jamais de « renvoyer le code » ; un verrou par site empêche deux
// gestes simultanés ; un jeton du connecteur Claude est refusé ; identifiants et
// session ne quittent jamais le serveur ; la réponse ne contient que l'état et un message.
//
// Déploiement : `npx supabase functions deploy dmbook-connexion --project-ref ybxuojtyevldrbieaykh`

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { jetonDeConnecteur, REFUS_CONNECTEUR } from '../_shared/connecteur.ts'
import { CORS_HEADERS as CORS, json } from '../_shared/http.ts'
import {
  clientServeur, enregistrer, ErreurSaisie, lireConnexion, prendreVerrou, raison, rendreVerrou, seConnecter, validerCode,
} from '../_shared/dmbook/serveur.ts'
import type { Database } from '../_shared/database.types.ts'

const CODE_RE = /^[A-Za-z0-9]{4,12}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texte = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const jeton = auth.replace(/^Bearer\s+/i, '')
  if (!jeton) return json({ error: 'Connexion à Dédale requise.' }, 401)
  if (jetonDeConnecteur(jeton)) return json({ error: REFUS_CONNECTEUR }, 403)

  let corps: Record<string, unknown>
  try {
    corps = await req.json()
  } catch {
    return json({ error: 'Corps de requête JSON attendu.' }, 400)
  }
  const action = corps.action
  if (action !== 'enregistrer' && action !== 'connecter' && action !== 'code') return json({ error: 'Action inconnue.' }, 400)
  const site = texte(corps.site_id, 36)
  if (!UUID_RE.test(site)) return json({ error: 'Site manquant.' }, 400)
  const code = texte(corps.code, 40).replace(/\s+/g, '')
  if (action === 'code' && !CODE_RE.test(code)) return json({ error: 'Le code doit faire de 4 à 12 chiffres ou lettres.' }, 400)

  // Droit : la base décide (rôle + site), avec le jeton de la personne.
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const personne = createClient<Database>(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: moi } = await personne.auth.getUser(jeton)
  if (!moi?.user) return json({ error: 'Connexion à Dédale requise.' }, 401)
  const { data: peut, error: refus } = await personne.rpc('dmbook_peut_regler', { p_site: site })
  if (refus) return json({ error: 'Connexion à Dédale requise.' }, 401)
  if (peut !== true) return json({ error: 'Réservé aux administrateurs, managers et techniciens du site.' }, 403)

  const sb = clientServeur()
  if (action === 'enregistrer') {
    try {
      const mdp = typeof corps.mot_de_passe === 'string' && corps.mot_de_passe !== '' ? texte(corps.mot_de_passe, 200) : null
      return json(await enregistrer(sb, site, moi.user.id, {
        adresse: texte(corps.adresse, 300), identifiant: texte(corps.identifiant, 200), motDePasse: mdp,
      }))
    } catch (e) {
      if (e instanceof ErreurSaisie) return json({ error: e.message }, 400)
      console.error('[dmbook-connexion]', raison(e))
      return json({ error: 'Erreur du serveur pendant l’enregistrement.' }, 500)
    }
  }

  const c = await lireConnexion(sb, site)
  if (!c) return json({ error: 'Aucune connexion Dmbook n’est réglée pour ce site.' }, 409)
  if (!(await prendreVerrou(sb, site, 120)))
    return json({ error: 'Une connexion à Dmbook est déjà en cours. Patiente une minute.' }, 409)
  try {
    if (action === 'connecter') {
      if (c.etat === 'code_requis') return json({ error: 'Dmbook attend déjà un code : saisis celui reçu par e-mail.' }, 409)
      if (c.etat === 'ok') return json({ error: 'Ce site est déjà connecté à Dmbook.' }, 409)
      if (c.etat === 'pause') return json({ error: 'La synchro Dmbook de ce site est en pause.' }, 409)
      return json(await seConnecter(sb, c))
    }
    if (c.etat !== 'code_requis') return json({ error: 'Dmbook n’attend pas de code en ce moment.' }, 409)
    return json(await validerCode(sb, c, code))
  } catch (e) {
    console.error('[dmbook-connexion]', raison(e))
    return json({ error: 'Erreur du serveur pendant la connexion à Dmbook.' }, 500)
  } finally {
    await rendreVerrou(sb, site)
  }
})
