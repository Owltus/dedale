// =============================================================================
// Sonde du CONNECTEUR CLAUDE (fonction mcp), lectures du parc — base LOCALE
// JETABLE uniquement. Appelée par edge-functions.mjs pendant que les fonctions
// sont servies (`supabase functions serve`).
// =============================================================================
// Le connecteur n'accepte que les jetons émis par le serveur OAuth à un client
// (claim `client_id`) et la base ne lui ouvre que la lecture, current_role,
// get_my_sites et les RPC claude_* (garde_connecteur, 157). Pour jouer Claude
// SANS navigateur ni flux OAuth, la sonde :
//   1. déclare une application OAuth « de confiance » (retour claude.ai,
//      confidentielle) dans auth.oauth_clients, et ouvre l'accès Claude
//      (acces_ia) des comptes de test, en admin ;
//   2. rejoue le vrai jeton de chaque compte en y ajoutant `client_id`, signé
//      avec le secret HS256 de la pile LOCALE (accepté par Auth et PostgREST) ;
//   3. pose un terrain (connecteur-lecture.semis.sql), appelle les outils du
//      parc par le protocole MCP, et compare à l'attendu ;
//   4. retire tout (terrain, application, accès) quoi qu'il arrive.
// Un écart est un FINDING : on ne corrige pas l'attendu pour passer.
// =============================================================================
import { spawnSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ANON, API, DB, FN, JWT_SECRET } from './cible.mjs'

const d = JSON.parse(
  readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8'),
)
const SEMIS = fileURLToPath(
  new URL('./connecteur-lecture.semis.sql', import.meta.url),
)
const MDP = 'MartinTest!2026#aB'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const COMPTES = ['techniciena', 'demandeura', 'managerb']

function psql(args, entree) {
  const r = spawnSync(
    'psql',
    ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', DB, ...args],
    {
      input: entree,
      encoding: 'utf8',
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    },
  )
  if (r.status !== 0) throw new Error(`psql : ${r.stderr}`)
  return r.stdout.trim()
}

/** Écrit en admin (les déclencheurs de users exigent un admin de l'application). */
const enAdmin = (sql) =>
  psql(
    ['-v', `admin=${d.users.admin}`],
    `BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true) \\gset
${sql}
COMMIT;`,
  )

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Jeton du compte, rejoué avec `client_id` : ce que Claude présenterait. */
async function jetonConnecteur(email, clientId) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: MDP }),
  })
  const brut = (await r.json()).access_token
  const charge = JSON.parse(
    Buffer.from(brut.split('.')[1], 'base64url').toString(),
  )
  const corps = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...charge, client_id: clientId })}`
  const signature = createHmac('sha256', JWT_SECRET)
    .update(corps)
    .digest('base64url')
  return { application: brut, connecteur: `${corps}.${signature}` }
}

async function outil(jeton, nom, args) {
  const r = await fetch(`${FN}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: nom, arguments: args },
    }),
  })
  if (r.status !== 200) return { statut: r.status, erreur: true, texte: '' }
  const j = await r.json()
  const texte = j.result?.content?.[0]?.text ?? JSON.stringify(j)
  let donnees = null
  try {
    donnees = JSON.parse(texte)
  } catch {
    /* message d'erreur en clair */
  }
  return { statut: 200, erreur: j.result?.isError === true, texte, donnees }
}

/** Uuid présents dans la réponse hors des clés permises (id / local_id). */
function identifiantsMontres(v, permises, cle = '') {
  if (typeof v === 'string')
    return !permises.includes(cle) && UUID.test(v) ? [cle] : []
  if (Array.isArray(v))
    return v.flatMap((x) => identifiantsMontres(x, permises, cle))
  if (v && typeof v === 'object')
    return Object.entries(v).flatMap(([k, x]) =>
      identifiantsMontres(x, permises, k),
    )
  return []
}

async function rpcDirecte(jeton, nom, params) {
  const r = await fetch(`${API}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  return r.status
}

/** Joue la sonde ; renvoie la liste des écarts (vide = conforme). */
export async function sonderConnecteur() {
  const x = `CL${Date.now()}`
  const client = randomUUID()
  const ecarts = []
  const controle = (titre, ok, detail = '') => {
    console.log(
      `${ok ? '  ok   ' : ' ALERTE'} mcp  ${titre}${ok ? '' : ` -> ${detail}`}`,
    )
    if (!ok) ecarts.push(`mcp / ${titre} : ${detail}`)
  }
  const ids = COMPTES.map((c) => `'${c}@martin.test'`).join(', ')

  const terrain = JSON.parse(
    psql([
      '-v',
      `siteA=${d.A.site}`,
      '-v',
      `batimentA=${d.A.batiment}`,
      '-v',
      `siteB=${d.B.site}`,
      '-v',
      `niveauB=${d.B.niveau}`,
      '-v',
      `auteur=${d.users.technicienA}`,
      '-v',
      `suffixe=${x}`,
      '-f',
      SEMIS,
    ])
      .split('\n')
      .at(-1),
  )
  try {
    psql([
      '-c',
      `INSERT INTO auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_name, client_type, token_endpoint_auth_method)
       VALUES ('${client}', 'dynamic', 'https://claude.ai/api/mcp/auth_callback', 'authorization_code', 'Sonde Martin', 'confidential', 'client_secret_basic');`,
    ])
    enAdmin(
      `UPDATE public.users SET acces_ia = true WHERE id IN (SELECT id FROM auth.users WHERE email IN (${ids}));`,
    )
    const j = {}
    for (const c of COMPTES)
      j[c] = await jetonConnecteur(`${c}@martin.test`, client)
    const tech = j.techniciena.connecteur

    console.log('\n=== Connecteur Claude : lectures du parc ===\n')

    // Entrée : jeton de l'application refusé, jeton du connecteur accepté.
    const app = await outil(j.techniciena.application, 'mes_sites', {})
    controle(
      'jeton de l’application refusé (401)',
      app.statut === 401,
      `${app.statut}`,
    )
    const sites = await outil(tech, 'mes_sites', {})
    controle(
      'jeton du connecteur accepté, rôle lu',
      sites.donnees?.role === 'technicien',
      sites.texte.slice(0, 120),
    )

    // Garde : fiche_local fermée au connecteur, son enveloppe claude_* ouverte.
    const fermee = await rpcDirecte(tech, 'fiche_local', {
      p_local_id: terrain.lieu101,
    })
    controle(
      'RPC fiche_local refusée au connecteur (garde 157)',
      fermee === 403,
      `${fermee}`,
    )
    const ouverte = await rpcDirecte(tech, 'claude_fiche_lieu', {
      p_local_id: terrain.lieu101,
      p_limite: 100000,
    })
    controle(
      'RPC claude_fiche_lieu permise (limite hors bornes ramenée)',
      ouverte === 200,
      `${ouverte}`,
    )

    const inconnu = await outil(tech, 'flottes', { inconnu: 1 })
    controle(
      'paramètre inconnu refusé',
      inconnu.erreur && /^Paramètres refusés/.test(inconnu.texte),
      inconnu.texte,
    )
    const tropLong = await outil(tech, 'lieux', { limite: 101 })
    controle(
      'limite au-delà du plafond refusée',
      tropLong.erreur,
      tropLong.texte,
    )

    // Flottes.
    const fl = await outil(tech, 'flottes', { recherche: `cl ${x}` })
    const f0 = fl.donnees?.flottes?.[0]
    controle(
      'flottes : la flotte du site, son modèle, 3 équipements, un lot de 2',
      fl.donnees?.flottes?.length === 1 &&
        f0.site === 'Site Alpha' &&
        f0.modele === `Détecteur optique cl ${x}` &&
        f0.equipements === 3 &&
        f0.deploiements_recents?.[0]?.equipements === 2 &&
        f0.plans_maintenance?.[0]?.equipements === 3,
      fl.texte.slice(0, 200),
    )
    const flB = await outil(j.managerb.connecteur, 'flottes', {
      recherche: `cl ${x}`,
    })
    controle(
      'flottes : site B ne voit que sa flotte',
      flB.donnees?.flottes?.length === 1 &&
        flB.donnees.flottes[0].flotte === `Flotte B cl ${x}`,
      flB.texte.slice(0, 200),
    )

    // Bibliothèque.
    const bi = await outil(tech, 'bibliotheque', { recherche: `cl ${x}` })
    const modeles = bi.donnees?.modeles ?? []
    const commun = modeles.find(
      (m) => m.origine.startsWith('Commun') && m.modele.startsWith('Détecteur'),
    )
    controle(
      'bibliotheque : site + commun, commun installé sur le site, rien du site B',
      modeles.length === 3 &&
        commun?.installe_sur?.[0] === 'Site Alpha' &&
        !modeles.some((m) => m.modele.startsWith('Modèle B')),
      bi.texte.slice(0, 200),
    )

    // Équipements.
    const eq = await outil(tech, 'equipements', { flotte: `Détecteur cl ${x}` })
    const noms = (eq.donnees?.equipements ?? []).map((e) => e.nom).sort()
    controle(
      'equipements : nom = flotte + valeur principale · secondaire',
      noms.length === 3 &&
        noms[0] === `Détecteur cl ${x} Chambre 101 · Optique`,
      noms.join(' | '),
    )

    // Lieux : parcourir un niveau.
    const li = await outil(tech, 'lieux', { niveau: `R+1 cl ${x}` })
    const c101 = li.donnees?.lieux?.find(
      (l) => l.local === `Chambre 101 cl ${x}`,
    )
    controle(
      'lieux : parcourir sans recherche (arbre, type, surface, PMR, caractéristiques)',
      li.donnees?.total === 3 &&
        li.donnees.arbre?.[0]?.niveaux?.[0]?.lieux === 3 &&
        c101?.type === 'Chambre standard' &&
        c101.accessible_pmr === true &&
        c101.caracteristiques?.Literie === 'Double',
      li.texte.slice(0, 200),
    )

    // Fiche d'un lieu, par rôle.
    const fi = await outil(tech, 'fiche_lieu', { local_id: terrain.lieu101 })
    controle(
      'fiche_lieu (technicien) : site, équipement, plan de maintenance actif',
      fi.donnees?.lieu?.site === 'Site Alpha' &&
        fi.donnees.equipements?.length === 1 &&
        fi.donnees.plans_maintenance_actifs?.length === 1,
      fi.texte.slice(0, 200),
    )
    const fd = await outil(j.demandeura.connecteur, 'fiche_lieu', {
      local_id: terrain.lieu101,
    })
    controle(
      'fiche_lieu (demandeur) : OT et plans « non visibles », DI lisibles',
      fd.donnees?.ot_ouverts === null &&
        fd.donnees.plans_maintenance_actifs === null &&
        Array.isArray(fd.donnees.demandes_ouvertes) &&
        /ordres de travail/.test(fd.donnees.non_visible ?? ''),
      fd.texte.slice(0, 200),
    )
    const fb = await outil(j.managerb.connecteur, 'fiche_lieu', {
      local_id: terrain.lieu101,
    })
    controle(
      'fiche_lieu (autre site) : introuvable',
      fb.erreur && /introuvable/.test(fb.texte),
      fb.texte,
    )

    // Jamais d'identifiant hors des clés prévues pour les gestes d'écriture.
    for (const [nom, r, permises] of [
      ['flottes', fl, []],
      ['bibliotheque', bi, []],
      ['fiche_lieu', fi, []],
      ['equipements', eq, ['id', 'local_id']],
      ['lieux', li, ['id', 'local_id']],
    ]) {
      const montres = identifiantsMontres(r.donnees, permises)
      controle(
        `${nom} : aucun identifiant montré`,
        montres.length === 0,
        montres.join(', '),
      )
    }
  } finally {
    enAdmin(
      `UPDATE public.users SET acces_ia = false WHERE id IN (SELECT id FROM auth.users WHERE email IN (${ids}));`,
    )
    psql(
      ['-v', `suffixe=${x}`, '-v', `client=${client}`],
      `BEGIN;
SELECT set_config('cl.x', :'suffixe', true), set_config('cl.client', :'client', true) \\gset
DELETE FROM auth.oauth_clients WHERE id = current_setting('cl.client')::uuid;
DELETE FROM public.ordres_travail WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% cl ' || current_setting('cl.x'));
DELETE FROM public.gammes_equipements WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% cl ' || current_setting('cl.x'));
DELETE FROM public.gammes WHERE nom LIKE '% cl ' || current_setting('cl.x');
DELETE FROM public.equipements WHERE code_inventaire LIKE 'DET%-' || current_setting('cl.x');
DELETE FROM public.categories WHERE parent_id IS NOT NULL AND nom LIKE '% cl ' || current_setting('cl.x');
DELETE FROM public.modeles_equipements WHERE nom LIKE '% cl ' || current_setting('cl.x');
DELETE FROM public.categories WHERE nom LIKE '% cl ' || current_setting('cl.x');
DELETE FROM public.locaux WHERE nom LIKE '% cl ' || current_setting('cl.x');
DELETE FROM public.niveaux WHERE nom LIKE '% cl ' || current_setting('cl.x');
COMMIT;`,
    )
  }
  return ecarts
}
