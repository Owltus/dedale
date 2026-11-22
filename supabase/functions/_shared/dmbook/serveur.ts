/**
 * Côté serveur de la synchro Dmbook (plan sync-dmbook, étapes 3a / 8a, migration 163).
 *
 * L'état vit dans `dmbook_etat` (une ligne) et la session dans le coffre chiffré
 * (`dmbook_session_lire/ecrire`). Tout passe par la clé de service : ces objets
 * sont fermés à l'application, qui ne lit que `dmbook_etat_public()`.
 *
 * Consignes PO non négociables, tenues ici :
 *   - UNE tentative de connexion par appel, jamais de boucle ;
 *   - code e-mail demandé → on s'arrête, on range la reprise, Dédale affiche la fenêtre ;
 *   - le code est envoyé UNE fois ; jamais « renvoyer le code » ;
 *   - identifiant et mot de passe lus dans les secrets, jamais écrits nulle part.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { Dmbook, type Cookie, type Reprise } from './client.ts'

export type EtatConnexion = 'jamais_connecte' | 'ok' | 'code_requis' | 'pause' | 'erreur'

export type EtatDmbook = {
  site_id: string
  base: string
  carnet: string
  etat: EtatConnexion
  message: string | null
}

type Session = { cookies?: Cookie[]; reprise?: Reprise | null }

export type Issue = { etat: EtatConnexion; message: string }

export function clientServeur(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !cle) throw new Error('Configuration serveur incomplète.')
  return createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function lireEtat(sb: SupabaseClient): Promise<EtatDmbook> {
  const { data, error } = await sb.from('dmbook_etat').select('site_id, base, carnet, etat, message').eq('id', true).single()
  if (error) throw new Error(`État Dmbook illisible : ${error.message}`)
  return data as EtatDmbook
}

export async function majEtat(sb: SupabaseClient, champs: Record<string, unknown>) {
  const { error } = await sb.from('dmbook_etat').update({ ...champs, maj_le: new Date().toISOString() }).eq('id', true)
  if (error) throw new Error(`État Dmbook non enregistré : ${error.message}`)
}

async function lireSession(sb: SupabaseClient): Promise<Session> {
  const { data, error } = await sb.rpc('dmbook_session_lire')
  if (error) throw new Error(`Session Dmbook illisible : ${error.message}`)
  return (data ?? {}) as Session
}

async function ecrireSession(sb: SupabaseClient, s: Session) {
  const { error } = await sb.rpc('dmbook_session_ecrire', { p_session: s })
  if (error) throw new Error(`Session Dmbook non enregistrée : ${error.message}`)
}

export async function prendreVerrou(sb: SupabaseClient, secondes: number): Promise<boolean> {
  const { data, error } = await sb.rpc('dmbook_verrou_prendre', { p_secondes: secondes })
  if (error) throw new Error(`Verrou Dmbook : ${error.message}`)
  return data === true
}

export async function rendreVerrou(sb: SupabaseClient) {
  await sb.rpc('dmbook_verrou_rendre')
}

/** « p…@exemple.fr » : assez pour savoir quelle boîte regarder, sans afficher l'adresse. */
export function masquer(identifiant: string): string {
  const i = identifiant.indexOf('@')
  if (i < 0) return `${identifiant.slice(0, 1)}…`
  return `${identifiant.slice(0, 1)}…${identifiant.slice(i)}`
}

function identifiants() {
  const id = Deno.env.get('DMBOOK_IDENTIFIANT')
  const mdp = Deno.env.get('DMBOOK_MOT_DE_PASSE')
  if (!id || !mdp) throw new Error('Identifiants Dmbook absents des secrets du serveur.')
  return { id, mdp }
}

function nouveauClient(etat: EtatDmbook, session: Session) {
  const dm = new Dmbook({ base: etat.base, carnet: etat.carnet, plafond: 20, trace: (l) => console.log(`[dmbook] ${l}`) })
  if (session.cookies?.length) dm.importerSession(session.cookies)
  return dm
}

const raison = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * UNE tentative de connexion (la session rangée est essayée d'abord : si elle
 * vaut encore, rien n'est envoyé à Dmbook). Puis lecture de la page 1, sans rien
 * modifier, pour prouver que la session lit bien les tickets.
 */
export async function seConnecter(sb: SupabaseClient, etat: EtatDmbook): Promise<Issue> {
  const { id, mdp } = identifiants()
  const session = await lireSession(sb)
  const dm = nouveauClient(etat, session)
  try {
    const r = await dm.connecter(id, mdp)
    if (r.etat === 'code_requis') {
      await ecrireSession(sb, { cookies: dm.exporterSession(), reprise: r.reprise })
      const issue: Issue = { etat: 'code_requis', message: 'Dmbook demande le code reçu par e-mail.' }
      await majEtat(sb, { ...issue, boite_code: masquer(id), code_demande_le: new Date().toISOString() })
      return issue
    }
    const { total } = await dm.lister(1)
    await ecrireSession(sb, { cookies: dm.exporterSession(), reprise: null })
    const issue: Issue = { etat: 'ok', message: `Connecté à Dmbook : ${total} tickets visibles.` }
    const maintenant = new Date().toISOString()
    await majEtat(sb, { ...issue, derniere_connexion: maintenant, dernier_passage: maintenant })
    return issue
  } catch (e) {
    const issue: Issue = { etat: 'erreur', message: `Connexion impossible : ${raison(e)}` }
    await majEtat(sb, issue)
    return issue
  }
}

/** Envoie le code UNE fois. Refusé → état « erreur » : aucun nouvel essai automatique. */
export async function validerCode(sb: SupabaseClient, etat: EtatDmbook, code: string): Promise<Issue> {
  const session = await lireSession(sb)
  if (!session.reprise) {
    const issue: Issue = { etat: 'erreur', message: 'L’écran du code a expiré. Relance la connexion.' }
    await majEtat(sb, issue)
    return issue
  }
  const dm = nouveauClient(etat, session)
  try {
    await dm.fournirCode(session.reprise, code)
    const { total } = await dm.lister(1)
    await ecrireSession(sb, { cookies: dm.exporterSession(), reprise: null })
    const issue: Issue = { etat: 'ok', message: `Connecté à Dmbook : ${total} tickets visibles.` }
    const maintenant = new Date().toISOString()
    await majEtat(sb, { ...issue, code_demande_le: null, derniere_connexion: maintenant, dernier_passage: maintenant })
    return issue
  } catch (e) {
    // La reprise ne resservira pas : un code ne s'envoie qu'une fois.
    await ecrireSession(sb, { cookies: dm.exporterSession(), reprise: null })
    const issue: Issue = { etat: 'erreur', message: `Code non accepté : ${raison(e)} Relance la connexion quand tu es prêt : Dmbook enverra un nouveau code.` }
    await majEtat(sb, { ...issue, code_demande_le: null })
    return issue
  }
}
