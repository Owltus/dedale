// Edge Function `mcp` (Deno) — connecteur Claude pour Dédale (lecture + gestes encadrés sur les OT et les DI).
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
import { OUTILS, executerOutil, type Contexte } from './outils.ts'

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
  'Access-Control-Allow-Headers':
    'authorization, content-type, mcp-protocol-version, mcp-session-id',
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

/** Lit la charge utile d'un JWT (déjà validé par Supabase Auth). */
function charge(jeton: string): Record<string, unknown> {
  try {
    const b64 = jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')))
  } catch {
    return {}
  }
}

const INSTRUCTIONS = `Dédale est la GMAO (maintenance) de l'établissement. Tu agis avec les droits de la personne connectée : tu ne vois que ses sites. Le connecteur ne donne jamais accès aux fichiers (PDF, images), seulement à leurs noms.
SITES : si la personne a plusieurs sites (outil mes_sites), nomme toujours le site de chaque OT, DI, lieu ou équipement dont tu parles, et ne mélange jamais deux sites dans un même point ou un même aperçu. Si ce qu'elle dit peut viser plusieurs sites (même nom de lieu, même gamme), demande lequel avant d'écrire. Avec un seul site, inutile de le répéter.
RÔLE : la base ne montre que ce que le rôle de la personne permet. Un résultat vide peut donc vouloir dire « pas le droit de voir », pas « il n'y en a pas » : un demandeur, par exemple, ne voit que les demandes d'intervention, les lieux, les équipements et les problèmes courants de ses sites, ni OT, ni plan de maintenance, ni contrats. Ne conclus pas à l'absence ; dis ce que son accès couvre.
Vocabulaire : OT = ordre de travail ; « Plan de maintenance » = les gammes ; DI = demande d'intervention ; un OT « programmé » est généré automatiquement, « planifié » a été placé par une personne. Un OT est en retard quand sa date prévue plus sa tolérance est dépassée et qu'il n'est ni clôturé ni annulé ; le retard n'est pas un statut, il disparaît quand l'OT est fait ou replanifié.

ÉCRIRE (si la personne y a droit ; sinon l'outil le dit) — ordres de travail et demandes d'intervention, rien d'autre. Tout geste d'écriture s'appelle d'abord SANS appliquer : c'est un aperçu calculé par la base, rien n'est enregistré. Montre-le clairement et attends un oui explicite ; puis rappelle l'outil avec exactement les mêmes paramètres, appliquer=true et le code de confirmation. Jamais d'enregistrement sans ce oui.

ORDRES DE TRAVAIL :
1. On ne change jamais le statut d'un OT à la main : on enregistre ses opérations (saisir_operations). Dédale en déduit le statut : en cours dès qu'une opération démarre ; clôture automatique quand toutes sont faites ou non applicables (au moins une faite) ; annulation automatique si toutes sont non applicables ; puis la base programme l'OT suivant.
2. Avant d'écrire, relis l'OT (ordre_travail) et fais le point avec la personne : ce qui est déjà fait (avec ses dates), ce qui reste. Si elle parle d'une opération et que l'OT en contient d'autres, signale-les. Demande la ou les dates d'intervention (propose « toutes le même jour ? » quand c'est plausible). N'invente jamais une date, une valeur ou un commentaire.
3. L'unité est l'OPÉRATION, jamais l'équipement. Un OT peut porter plusieurs opérations différentes, répétées sur plusieurs équipements (chacun dans un local) ; elles ne sont pas forcément faites ensemble. Quand l'OT a plusieurs équipements, fais le point par opération : pour chacune, sur quels équipements (et locaux) elle est faite et où elle reste. Rapproche ce que dit la personne des noms d'opération, d'équipement et de local (un lieu cité désigne l'équipement de ce local). Si elle cite des équipements ou des lieux sans dire quelles opérations, demande lesquelles ; si elle cite une opération sans dire où, demande sur quels équipements. Ne coche jamais d'office toutes les opérations d'un équipement.
4. Au moindre doute, demande au lieu de deviner : quel OT ? « pas fait » veut-il dire plus tard (en attente) ou ne s'applique pas (non applicable) ? quelle unité ?
5. Dans l'aperçu, montre les opérations, valeurs, conformité, statut de l'OT après, OT suivant et alertes. L'aperçu et le oui valent même pour une seule opération.
6. Signale toute mesure non conforme, et tout document attendu par la gamme (à ajouter depuis l'application Dédale).
7. Un OT clôturé est figé : pour le corriger, propose de le rouvrir (motif) ; reclôturer un OT rouvert dont tout est réglé : cloturer_ot.

DEMANDES D'INTERVENTION (DI) — cycle : Ouvert → En cours (prise en charge) → Clôturé, et réouverture si le problème revient :
1. Le lieu est obligatoire et doit être exact : sinon l'intervention ne cible pas le bon endroit et ses équipements ne se retrouvent pas. Trouve le local avec l'outil lieux. Lieu vague (« au 2e », « la clim ») ou ambigu (un même nom sur plusieurs niveaux) : demande avant d'écrire. Ajoute les équipements concernés quand ils sont identifiables, uniquement ceux de ce local.
2. Une DI = un problème à un endroit. Plusieurs endroits ou plusieurs problèmes dans un message = plusieurs DI, chacune avec son aperçu.
3. Avant de créer : regarde les DI non clôturées sur ce lieu (outil demandes ; l'aperçu les signale aussi en « doublons »). S'il en existe une pour le même problème, propose de la compléter (modifier_demande) plutôt que d'en créer une. Consulte les problèmes courants du site (problemes_courants) : quand l'un correspond, pars de son constat type et adapte-le.
4. Le constat est factuel et se comprend sans contexte, pour qu'un technicien sache exactement ce qui se passe : quoi (le symptôme observé), où précisément dans le lieu, depuis quand si la personne le sait, et la conséquence (chambre inutilisable, fuite active, risque). Pas de cause supposée, pas de remède, rien d'inventé : il vient des mots de la personne, que tu reformules et qu'elle valide dans l'aperçu. S'il manque quelque chose d'essentiel, demande-le. Date du constat : le jour où le problème a été vu (défaut aujourd'hui).
5. Clôture : demande ce qui a été fait (note de résolution, facultative, jamais inventée) et le jour de l'intervention. Réouverture : motif obligatoire, ajouté daté au constat.
6. Un demandeur ne peut que créer des DI et corriger le constat des siennes encore « Ouvert » ; si un geste est refusé, explique-le simplement.
Réponds en français, avec les dates au format JJ/MM/AAAA et leur numéro de semaine.`

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
      return ok({ tools: OUTILS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) })
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: qui, error: erreurJeton } = await supabase.auth.getUser(jeton)
  if (erreurJeton || !qui.user) return nonAutorise(url, 'Jeton invalide ou expiré.')
  const claims = charge(jeton)
  if (typeof claims.client_id !== 'string' || claims.client_id === '')
    return nonAutorise(url, 'Seuls les jetons émis au connecteur sont acceptés.')

  let corps: unknown
  try {
    corps = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } }, 400)
  }

  const ctx: Contexte = { supabase, userId: qui.user.id }
  if (Array.isArray(corps)) {
    const reponses = (await Promise.all(corps.map((m) => traiter(m as Message, ctx)))).filter((r) => r !== null)
    return reponses.length ? json(reponses) : new Response(null, { status: 202, headers: CORS })
  }
  const reponse = await traiter(corps as Message, ctx)
  return reponse === null ? new Response(null, { status: 202, headers: CORS }) : json(reponse)
})
