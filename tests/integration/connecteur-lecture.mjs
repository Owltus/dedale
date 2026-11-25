// =============================================================================
// Intégration — fiche d'un lieu pour le connecteur Claude (185), VRAIE base
// =============================================================================
// Lancé par `npm run base:tester` (après `npm run base:monter`), ou seul :
//   MARTIN_LOCAL_DIR=supabase-local node tests/integration/connecteur-lecture.mjs
//
// Ce que prouve cette suite : l'enveloppe claude_fiche_lieu rend, pour chaque
// identité, exactement ce que fiche_local et les *_du_lieu (183) lui montrent
// — mêmes compteurs, listes des éléments OUVERTS de la bonne taille — sans
// aucun identifiant ni chemin de fichier, avec une liste NULL (et non « [] »)
// pour chaque onglet que le rôle ne voit pas, des listes bornées par p_limite,
// et rien pour anon.
//
// TERRAIN : celui de lecture-du-lieu.semis.sql (un lieu chargé par chaque
// chemin, plus des leurres), joué sur les sites A et B. Ouverts attendus : OT 1,
// DI 2, travaux 3, événements 3, plans de maintenance 1 ; documents 4 ;
// équipements 2.
// MATRICE identité × lieu : métier de SON site (admin partout) → tout ;
// demandeur → équipements et DI, le reste NULL ; hors site → NULL entier.
//
// Le passage par la fonction mcp (jeton de connecteur, garde d'entrée) est
// sondé par tests/securite/connecteur-mcp.mjs, quand les fonctions sont servies.
// Un écart est un FINDING à rapporter : on ne corrige pas l'attendu pour passer.
// =============================================================================
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ANON, API, DB } from '../securite/cible.mjs'

const SEMIS = JSON.parse(
  readFileSync(new URL('../securite/seed-data.json', import.meta.url), 'utf8'),
)
const FICHIER_SEMIS = fileURLToPath(
  new URL('./lecture-du-lieu.semis.sql', import.meta.url),
)
const MDP_LOCAL = 'MartinTest!2026#aB'
const IDENTITES = [
  'admin',
  'managerA',
  'technicienA',
  'lecteurA',
  'demandeurA',
  'managerB',
  'technicienB',
]
const SITES = ['A', 'B']
const SUFFIXE = `CL${Date.now()}`
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Liste de la réponse → compteur de fiche_local qui la commande, et taille attendue. */
const LISTES = {
  equipements: ['equipements', 2],
  ot: ['ot', 1],
  demandes: ['di', 2],
  travaux: ['travaux', 3],
  evenements: ['evenements', 3],
  plans_maintenance: ['gammes', 1],
  documents: ['documents', 4],
}

const siteDe = (identite) => (identite === 'admin' ? null : identite.at(-1))

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

function semer(site) {
  const demandeur =
    site === 'A' ? SEMIS.users.demandeurA : SEMIS.users.technicienB
  const sortie = psql([
    '-v',
    `site=${SEMIS[site].site}`,
    '-v',
    `niveau=${SEMIS[site].niveau}`,
    '-v',
    `auteur=${SEMIS.users[`technicien${site}`]}`,
    '-v',
    `demandeur=${demandeur}`,
    '-v',
    `suffixe=${SUFFIXE}${site}`,
    '-f',
    FICHIER_SEMIS,
  ])
  return JSON.parse(sortie.split('\n').at(-1))
}

/** Retire le terrain (en admin : les déclencheurs de fichiers l'exigent) — comme lecture-du-lieu.mjs. */
function menager(site) {
  psql(
    ['-v', `suffixe=${SUFFIXE}${site}`, '-v', `admin=${SEMIS.users.admin}`],
    `BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true),
       set_config('lieu.x', :'suffixe', true) \\gset
SET LOCAL ROLE authenticated;
DELETE FROM public.documents WHERE storage_path LIKE '%-' || current_setting('lieu.x') || '.pdf';
DELETE FROM public.evenements WHERE titre LIKE '% ' || current_setting('lieu.x');
DELETE FROM public.interventions_travaux WHERE titre LIKE '% ' || current_setting('lieu.x');
DELETE FROM public.demandes_intervention WHERE constat LIKE '% ' || current_setting('lieu.x');
DELETE FROM public.ordres_travail WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% ' || current_setting('lieu.x'));
DELETE FROM public.gammes_equipements WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% ' || current_setting('lieu.x'));
DELETE FROM public.gammes WHERE nom LIKE '% ' || current_setting('lieu.x');
DELETE FROM public.categories WHERE nom LIKE 'Famille % ' || current_setting('lieu.x');
DELETE FROM public.categories WHERE nom LIKE 'Domaine % ' || current_setting('lieu.x');
DELETE FROM public.equipements WHERE code_inventaire LIKE '%-' || current_setting('lieu.x');
DELETE FROM public.locaux WHERE nom LIKE 'Lieu % ' || current_setting('lieu.x');
COMMIT;`,
  )
}

async function connecter(identite) {
  const client = createClient(API, ANON, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `cl-${identite}`,
    },
  })
  const { error } = await client.auth.signInWithPassword({
    email: `${identite.toLowerCase()}@martin.test`,
    password: MDP_LOCAL,
  })
  if (error) throw new Error(`Connexion ${identite} : ${error.message}`)
  return client
}

async function rpc(client, nom, params) {
  const { data, error } = await client.rpc(nom, params)
  if (error) throw new Error(`${nom} : ${error.code} ${error.message}`)
  return data
}

/** Chaînes portant un uuid, et clés interdites (chemins de fichier). */
function fuites(v, cle = '') {
  if (typeof v === 'string') return UUID.test(v) ? [`${cle}=${v}`] : []
  if (Array.isArray(v)) return v.flatMap((x) => fuites(x, cle))
  if (v && typeof v === 'object')
    return Object.entries(v).flatMap(([k, x]) =>
      /path$/.test(k) ? [k] : fuites(x, k),
    )
  return []
}

const egaux = (a, b) => JSON.stringify(trie(a)) === JSON.stringify(trie(b))
function trie(o) {
  if (o === null || typeof o !== 'object') return o
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, trie(o[k])]),
  )
}

async function controler(client, identite, site, t) {
  const ecarts = []
  const voit = identite === 'admin' || siteDe(identite) === site
  const fiche = await rpc(client, 'claude_fiche_lieu', { p_local_id: t.local })
  if (!voit) {
    if (fiche !== null) ecarts.push(['fiche', 'attendu NULL (hors site)'])
    return ecarts
  }
  if (fiche === null) return [['fiche', 'NULL alors que le lieu est visible']]
  const reference = await rpc(client, 'fiche_local', { p_local_id: t.local })
  if (!egaux(fiche.compteurs, reference.compteurs))
    ecarts.push([
      'compteurs',
      `${JSON.stringify(fiche.compteurs)} ≠ fiche_local ${JSON.stringify(reference.compteurs)}`,
    ])
  if (fiche.lieu?.nom !== reference.local.nom || !fiche.lieu?.chemin_complet)
    ecarts.push(['en-tête', 'nom ou chemin absent'])
  for (const [liste, [compteur, taille]] of Object.entries(LISTES)) {
    const visible = reference.compteurs[compteur] !== null
    const valeur = fiche[liste]
    if (!visible) {
      if (valeur !== null)
        ecarts.push([liste, 'liste rendue pour un onglet non visible'])
    } else if (!Array.isArray(valeur) || valeur.length !== taille) {
      ecarts.push([liste, `${valeur?.length ?? valeur} au lieu de ${taille}`])
    }
  }
  const f = fuites(fiche)
  if (f.length) ecarts.push(['identifiants', f.slice(0, 3).join(', ')])

  // Plafond : p_limite = 1 → une ligne au plus par liste ; hors bornes → ramené.
  const une = await rpc(client, 'claude_fiche_lieu', {
    p_local_id: t.local,
    p_limite: 1,
  })
  for (const liste of Object.keys(LISTES))
    if (Array.isArray(une[liste]) && une[liste].length > 1)
      ecarts.push([`${liste}(limite 1)`, `${une[liste].length} lignes`])
  const enorme = await client.rpc('claude_fiche_lieu', {
    p_local_id: t.local,
    p_limite: 100000,
  })
  if (enorme.error) ecarts.push(['limite 100000', enorme.error.message])
  return ecarts
}

async function main() {
  const terrain = {}
  for (const site of SITES) terrain[site] = semer(site)
  try {
    const clients = {}
    for (const identite of IDENTITES)
      clients[identite] = await connecter(identite)
    const ecarts = []
    const lignes = []
    for (const identite of IDENTITES) {
      const cellules = []
      for (const site of SITES) {
        const constats = await controler(
          clients[identite],
          identite,
          site,
          terrain[site],
        )
        for (const [controle, detail] of constats)
          ecarts.push(`${identite} · ${site} · ${controle} : ${detail}`)
        cellules.push(`${site}: ${constats.length ? '✗' : '✓'}`.padEnd(8))
      }
      lignes.push(`  ${identite.padEnd(12)} ${cellules.join(' ')}`)
    }
    // anon : aucune exécution.
    const anon = createClient(API, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const refus = await anon.rpc('claude_fiche_lieu', {
      p_local_id: terrain.A.local,
    })
    if (!refus.error) ecarts.push('anon : claude_fiche_lieu exécutée')

    console.log('=== Matrice identité × lieu (claude_fiche_lieu) ===')
    console.log(lignes.join('\n'))
    if (ecarts.length) {
      console.log(
        '\nÉcarts NOUVEAUX (findings à rapporter, NE PAS corriger le test) :',
      )
      for (const e of ecarts) console.log(`  ✗ ${e}`)
    }
    console.log('\n=== 0 épinglé(s) ===')
    console.log(`=== ${ecarts.length} écart(s) ===`)
    if (ecarts.length) process.exitCode = 3
  } finally {
    for (const site of SITES) menager(site)
  }
}

main().catch((e) => {
  console.error(`ÉCHEC D’EXÉCUTION : ${e.message}`)
  process.exit(1)
})
