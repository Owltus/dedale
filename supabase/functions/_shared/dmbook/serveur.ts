/**
 * Côté serveur de la synchro Dmbook (plan sync-dmbook, étapes 3a, 3b, 8a ; migration 165).
 *
 * Une connexion PAR SITE (`dmbook_connexions`), réglée dans Dédale par l'admin,
 * le manager ou le technicien du site (D18, D19). Identifiants et session vivent
 * dans le coffre chiffré (`dmbook_identifiants_<site>`, `dmbook_session_<site>`),
 * lus et écrits par la clé de service seulement ; l'application ne les relit jamais.
 *
 * Consignes PO non négociables, tenues ici :
 *   - UNE tentative de connexion par appel, jamais de boucle ;
 *   - code e-mail demandé → on s'arrête, on range la reprise, Dédale affiche la fenêtre ;
 *   - le code est envoyé UNE fois ; jamais « renvoyer le code ».
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { type Cookie, Dmbook, type Reprise } from './client.ts'

export type EtatConnexion = 'jamais_connecte' | 'ok' | 'code_requis' | 'pause' | 'erreur'

export type Connexion = {
  site_id: string
  base: string
  carnet: string
  etat: EtatConnexion
  message: string | null
  regle_par: string | null
}

type Session = { cookies?: Cookie[]; reprise?: Reprise | null }
type Identifiants = { identifiant: string; mot_de_passe: string }

export type Issue = { etat: EtatConnexion; message: string }

export const raison = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function clientServeur(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !cle) throw new Error('Configuration serveur incomplète.')
  return createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function lireConnexion(sb: SupabaseClient, site: string): Promise<Connexion | null> {
  const { data, error } = await sb.from('dmbook_connexions')
    .select('site_id, base, carnet, etat, message, regle_par').eq('site_id', site).maybeSingle()
  if (error) throw new Error(`Connexion Dmbook illisible : ${error.message}`)
  return data as Connexion | null
}

export async function majConnexion(sb: SupabaseClient, site: string, champs: Record<string, unknown>) {
  const { error } = await sb.from('dmbook_connexions').update({ ...champs, maj_le: new Date().toISOString() }).eq(
    'site_id',
    site,
  )
  if (error) throw new Error(`Connexion Dmbook non enregistrée : ${error.message}`)
}

async function lireSecret<T>(sb: SupabaseClient, nom: string): Promise<T | null> {
  const { data, error } = await sb.rpc('dmbook_secret_lire', { p_nom: nom })
  if (error) throw new Error(`Coffre illisible : ${error.message}`)
  return data ? (JSON.parse(data as string) as T) : null
}

async function ecrireSecret(sb: SupabaseClient, nom: string, valeur: unknown | null) {
  const { error } = await sb.rpc('dmbook_secret_ecrire', {
    p_nom: nom,
    p_valeur: valeur === null ? null : JSON.stringify(valeur),
  })
  if (error) throw new Error(`Coffre non enregistré : ${error.message}`)
}

export async function lireCleTache(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb.rpc('dmbook_secret_lire', { p_nom: 'dmbook_cle_tache' })
  if (error) throw new Error(`Coffre illisible : ${error.message}`)
  return (data as string | null) ?? null
}

const lireSession = async (sb: SupabaseClient, site: string) =>
  (await lireSecret<Session>(sb, `dmbook_session_${site}`)) ?? {}
const ecrireSession = (sb: SupabaseClient, site: string, s: Session | null) =>
  ecrireSecret(sb, `dmbook_session_${site}`, s)

async function identifiants(sb: SupabaseClient, site: string): Promise<Identifiants> {
  const i = await lireSecret<Identifiants>(sb, `dmbook_identifiants_${site}`)
  if (!i?.identifiant || !i?.mot_de_passe) {
    throw new Error('Identifiants Dmbook du site non enregistrés : règle-les dans Dédale (Demandes → Dmbook).')
  }
  return i
}

export async function prendreVerrou(sb: SupabaseClient, site: string, secondes: number): Promise<boolean> {
  const { data, error } = await sb.rpc('dmbook_verrou_prendre', { p_site: site, p_secondes: secondes })
  if (error) throw new Error(`Verrou Dmbook : ${error.message}`)
  return data === true
}

export async function rendreVerrou(sb: SupabaseClient, site: string) {
  await sb.rpc('dmbook_verrou_rendre', { p_site: site })
}

/** « p…@exemple.fr » : assez pour savoir quelle boîte regarder, sans afficher l'adresse. */
export function masquer(identifiant: string): string {
  const i = identifiant.indexOf('@')
  if (i < 0) return `${identifiant.slice(0, 1)}…`
  return `${identifiant.slice(0, 1)}…${identifiant.slice(i)}`
}

/**
 * Adresse d'un carnet collée par l'utilisateur (D20) → base + numéro de carnet.
 * Seule une page de tickets d'un sous-domaine dmbook.pro est acceptée.
 */
export function lireAdresse(adresse: string): { base: string; carnet: string } | null {
  let u: URL
  try {
    u = new URL(adresse.trim())
  } catch {
    return null
  }
  const carnet = u.pathname.match(/^\/tickets\/(\d{1,12})(?:\/|$)/)?.[1]
  if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.dmbook\.pro$/.test(u.hostname) || !carnet) return null
  return { base: `https://${u.hostname}`, carnet }
}

function nouveauClient(c: Connexion, session: Session, plafond = 20) {
  const dm = new Dmbook({
    base: c.base,
    carnet: c.carnet,
    plafond,
    trace: (l) => console.log(`[dmbook ${c.site_id.slice(0, 8)}] ${l}`),
  })
  if (session.cookies?.length) dm.importerSession(session.cookies)
  return dm
}

/**
 * Enregistre la connexion d'un site (D18-D20). Mot de passe absent = on garde
 * l'ancien. Adresse ou identifiant changés → session effacée, état « jamais connecté » :
 * il faudra cliquer « Se connecter » (rien n'est tenté ici).
 */
export async function enregistrer(
  sb: SupabaseClient,
  site: string,
  par: string,
  saisie: { adresse: string; identifiant: string; motDePasse: string | null },
): Promise<Issue> {
  const a = lireAdresse(saisie.adresse)
  if (!a) {
    throw new ErreurSaisie(
      'Adresse du carnet non reconnue : colle l’adresse de la page des tickets Dmbook (https://….dmbook.pro/tickets/…).',
    )
  }
  const identifiant = saisie.identifiant.trim()
  if (!identifiant) throw new ErreurSaisie('L’identifiant Dmbook est obligatoire.')

  const avant = await lireConnexion(sb, site)
  const anciens = await lireSecret<Identifiants>(sb, `dmbook_identifiants_${site}`)
  const motDePasse = saisie.motDePasse ?? anciens?.mot_de_passe ?? ''
  if (!motDePasse) throw new ErreurSaisie('Le mot de passe Dmbook est obligatoire pour une première connexion.')

  // Premiers identifiants saisis sur une connexion déjà ouverte (reprise des réglages
  // Supabase, 22/11) : la session reste valable, on ne la jette pas (pas de code e-mail inutile).
  const change = !avant || avant.base !== a.base || avant.carnet !== a.carnet ||
    (!!anciens &&
      (anciens.identifiant !== identifiant ||
        (saisie.motDePasse !== null && saisie.motDePasse !== anciens.mot_de_passe)))
  const ligne = {
    site_id: site,
    base: a.base,
    carnet: a.carnet,
    boite_code: masquer(identifiant),
    regle_par: par,
    regle_le: new Date().toISOString(),
    maj_le: new Date().toISOString(),
    ...(change ? { etat: 'jamais_connecte', message: null, code_demande_le: null } : {}),
  }
  const { error } = await sb.from('dmbook_connexions').upsert(ligne, { onConflict: 'site_id' })
  if (error) {
    if (error.code === '23505') throw new ErreurSaisie('Ce carnet Dmbook est déjà relié à un autre site.')
    throw new Error(`Connexion Dmbook non enregistrée : ${error.message}`)
  }
  await ecrireSecret(sb, `dmbook_identifiants_${site}`, { identifiant, mot_de_passe: motDePasse })
  if (change) await ecrireSession(sb, site, null)
  return change
    ? { etat: 'jamais_connecte', message: 'Connexion enregistrée. Clique sur « Se connecter » pour la tester.' }
    : {
      etat: avant?.etat ?? 'jamais_connecte',
      message: anciens
        ? 'Connexion enregistrée, rien n’a changé.'
        : 'Identifiants enregistrés. La connexion en cours est gardée.',
    }
}

export class ErreurSaisie extends Error {}

/**
 * UNE tentative de connexion (la session rangée est essayée d'abord : si elle
 * vaut encore, rien n'est envoyé à Dmbook). Puis lecture de la page 1, sans rien
 * modifier, pour prouver que la session lit bien les tickets.
 */
export async function seConnecter(sb: SupabaseClient, c: Connexion): Promise<Issue> {
  const o = await ouvrir(sb, c, 20)
  if ('issue' in o) return o.issue
  try {
    const { total } = await o.dm.listerLeger(1)
    await garderSession(sb, c.site_id, o.dm)
    const issue: Issue = { etat: 'ok', message: `Connecté à Dmbook : ${total} tickets visibles.` }
    const maintenant = new Date().toISOString()
    await majConnexion(sb, c.site_id, { ...issue, derniere_connexion: maintenant })
    return issue
  } catch (e) {
    const issue: Issue = { etat: 'erreur', message: `Connexion impossible : ${raison(e)}` }
    await majConnexion(sb, c.site_id, issue)
    return issue
  }
}

/** Envoie le code UNE fois. Refusé → état « erreur » : aucun nouvel essai automatique. */
export async function validerCode(sb: SupabaseClient, c: Connexion, code: string): Promise<Issue> {
  const session = await lireSession(sb, c.site_id)
  if (!session.reprise) {
    const issue: Issue = { etat: 'erreur', message: 'L’écran du code a expiré. Relance la connexion.' }
    await majConnexion(sb, c.site_id, issue)
    return issue
  }
  const dm = nouveauClient(c, session)
  try {
    await dm.fournirCode(session.reprise, code)
    const { total } = await dm.listerLeger(1)
    await garderSession(sb, c.site_id, dm)
    const issue: Issue = { etat: 'ok', message: `Connecté à Dmbook : ${total} tickets visibles.` }
    await majConnexion(sb, c.site_id, { ...issue, code_demande_le: null, derniere_connexion: new Date().toISOString() })
    return issue
  } catch (e) {
    // La reprise ne resservira pas : un code ne s'envoie qu'une fois.
    await ecrireSession(sb, c.site_id, { cookies: dm.exporterSession(), reprise: null })
    const issue: Issue = {
      etat: 'erreur',
      message: `Code non accepté : ${
        raison(e)
      } Relance la connexion quand tu es prêt : Dmbook enverra un nouveau code.`,
    }
    await majConnexion(sb, c.site_id, { ...issue, code_demande_le: null })
    return issue
  }
}

/**
 * Client prêt à lire. La session rangée est essayée ; expirée → UNE connexion.
 * Code demandé → état « code_requis », pas de client.
 */
export async function ouvrir(
  sb: SupabaseClient,
  c: Connexion,
  plafond: number,
): Promise<{ dm: Dmbook } | { issue: Issue }> {
  try {
    const { identifiant, mot_de_passe } = await identifiants(sb, c.site_id)
    const dm = nouveauClient(c, await lireSession(sb, c.site_id), plafond)
    const r = await dm.connecter(identifiant, mot_de_passe)
    if (r.etat === 'code_requis') {
      await ecrireSession(sb, c.site_id, { cookies: dm.exporterSession(), reprise: r.reprise })
      const issue: Issue = { etat: 'code_requis', message: 'Dmbook demande le code reçu par e-mail.' }
      await majConnexion(sb, c.site_id, {
        ...issue,
        boite_code: masquer(identifiant),
        code_demande_le: new Date().toISOString(),
      })
      return { issue }
    }
    return { dm }
  } catch (e) {
    const issue: Issue = { etat: 'erreur', message: `Connexion impossible : ${raison(e)}` }
    await majConnexion(sb, c.site_id, issue)
    return { issue }
  }
}

/** Range la session après un passage (les cookies ont pu être renouvelés). */
export async function garderSession(sb: SupabaseClient, site: string, dm: Dmbook) {
  await ecrireSession(sb, site, { cookies: dm.exporterSession(), reprise: null })
}
