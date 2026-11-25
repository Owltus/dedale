// =============================================================================
// Intégration — lecture du lieu (183), jouée dans une VRAIE base
// =============================================================================
// Lancé par `npm run base:tester` (après `npm run base:monter`), ou seul :
//   MARTIN_LOCAL_DIR=supabase-local node tests/integration/lecture-du-lieu.mjs
//
// Ce que prouve cette suite : `fiche_local` et les cinq lectures `*_du_lieu`
// (OT, DI, travaux, événements, plans de maintenance) rassemblent ce qui est
// rattaché au lieu par CHACUN de ses chemins, sortent chaque objet UNE fois,
// ignorent les leurres (lieu voisin, gamme du commun), donnent des compteurs
// égaux aux listes, et respectent la RLS de la personne qui lit.
//
// TERRAIN (lecture-du-lieu.semis.sql, joué sur les sites A et B) : un lieu à
// deux équipements E1, E2 et un lieu leurre voisin (E3).
//   OT     : OT1 (gamme G1 liée à E1 + opération sur E1 : deux chemins, ouvert),
//            OT2 (opération sur E2, gamme détachée depuis : histoire, clôturé) ;
//            leurre : OT d'une gamme liée à E3.
//   gammes : G1 (active), G3 (inactive) ; leurres : G2 détachée, gamme du
//            COMMUN liée à E1, gamme liée à E3.
//   DI     : DI1 par le lieu, DI2 par E2 (clôturée), DI3 par le lieu ET E1 ET E2.
//   travaux: T1 lieu principal, T2 équipement principal, T3 par tâches (lieu +
//            E2), T4 lieu principal ET tâche (terminé).
//   événem.: V1 lieu principal, V2 équipement principal, V3 par tâches,
//            V4 équipement principal ET tâche (clôturé).
//   docs   : D1 par le lieu, D2 par E1, D3 par le lieu ET E1 ET E2, D4 déposé
//            par le demandeur du site (site B : par son technicien), lié au lieu.
//
// MATRICE ATTENDUE identité × lieu (« métier » = admin partout ; manager,
// technicien, lecteur sur LEUR site) :
//   métier      → tout (compteurs et listes ci-dessus) ;
//   demandeur   → équipements et DI ; gammes, OT, travaux, événements et
//                 documents : compteur NULL (« non visible »), listes vides.
//                 Documents : la RLS ne lui ouvre ni documents_locaux ni
//                 documents_equipements — même D4, qu'il a déposé, ne se voit
//                 pas par le lieu ;
//   hors site   → fiche NULL, listes vides.
//
// GARDE-FOUS : cible.mjs refuse tout ce qui n'est pas 127.0.0.1/localhost. Les
// lectures se font avec la clé PUBLIQUE et le vrai jeton de chaque compte ; le
// terrain est posé puis retiré par psql (base locale jetable).
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
/** Mot de passe des comptes de test LOCAUX — celui de tests/securite/semis.mjs. */
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
const SUFFIXE = `IT${Date.now()}`

/**
 * Écarts CONNUS, épinglés comme un `it.fails` : clé `identité · site · contrôle`
 * → motif. Vide : aucun écart connu.
 * @type {Map<string, string>}
 */
const ECARTS_CONNUS = new Map()

const roleDe = (identite) => identite.replace(/[AB]$/, '')
const siteDe = (identite) => (identite === 'admin' ? null : identite.at(-1))

// -----------------------------------------------------------------------------
// Outils
// -----------------------------------------------------------------------------

/** psql sur la base LOCALE ; renvoie la sortie standard. */
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

/** Retire le terrain (en admin : les déclencheurs de fichiers l'exigent). */
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
      storageKey: `lieu-${identite}`,
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

const trie = (ids) => [...ids].sort().join(',')
const egaux = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// -----------------------------------------------------------------------------
// Attendus
// -----------------------------------------------------------------------------

/** Ce que voit `identite` du lieu semé sur `site`. */
function attendu(identite, site, t) {
  const voitLeSite = identite === 'admin' || siteDe(identite) === site
  if (!voitLeSite) return null
  const demandeur = roleDe(identite) === 'demandeur'
  const v = (x) => Object.values(x)
  const listes = {
    ot_du_lieu: { tous: v(t.ot), ouverts: [t.ot.ot1] },
    di_du_lieu: { tous: v(t.di), ouverts: [t.di.di1, t.di.di3] },
    travaux_du_lieu: {
      tous: v(t.travaux),
      ouverts: [t.travaux.t1, t.travaux.t2, t.travaux.t3],
    },
    evenements_du_lieu: {
      tous: v(t.evenements),
      ouverts: [t.evenements.v1, t.evenements.v2, t.evenements.v3],
    },
    gammes_du_lieu: { tous: v(t.gammes), ouverts: [t.gammes.g1] },
  }
  if (demandeur)
    for (const nom of [
      'ot_du_lieu',
      'travaux_du_lieu',
      'evenements_du_lieu',
      'gammes_du_lieu',
    ])
      listes[nom] = { tous: [], ouverts: [] }
  const paire = (cleOuverts, nom) =>
    demandeur && nom !== 'di_du_lieu'
      ? null
      : {
          [cleOuverts]: listes[nom].ouverts.length,
          total: listes[nom].tous.length,
        }
  return {
    listes,
    compteurs: {
      equipements: 2,
      gammes: demandeur
        ? null
        : { actives: listes.gammes_du_lieu.ouverts.length, total: 2 },
      ot: paire('ouverts', 'ot_du_lieu'),
      di: paire('ouvertes', 'di_du_lieu'),
      travaux: paire('ouverts', 'travaux_du_lieu'),
      evenements: paire('ouverts', 'evenements_du_lieu'),
      documents: demandeur ? null : 4,
    },
  }
}

/** Compare la fiche et les listes lues par `client` à l'attendu ; renvoie les écarts. */
async function controler(client, identite, site, t) {
  const att = attendu(identite, site, t)
  const ecarts = []
  const fiche = await rpc(client, 'fiche_local', { p_local_id: t.local })
  if (att === null) {
    if (fiche !== null) ecarts.push(['fiche', 'attendu NULL (hors site)'])
  } else if (fiche === null) {
    ecarts.push(['fiche', 'NULL alors que le lieu est visible'])
  } else {
    if (fiche.local?.id !== t.local || !fiche.local?.chemin_complet)
      ecarts.push(['en-tête', 'id ou chemin absent'])
    if (!egaux(trieObjet(fiche.compteurs), trieObjet(att.compteurs)))
      ecarts.push([
        'compteurs',
        `attendu ${JSON.stringify(att.compteurs)}, obtenu ${JSON.stringify(fiche.compteurs)}`,
      ])
  }
  for (const nom of [
    'ot_du_lieu',
    'di_du_lieu',
    'travaux_du_lieu',
    'evenements_du_lieu',
    'gammes_du_lieu',
  ]) {
    for (const ouverts of [false, true]) {
      const lignes = await rpc(client, nom, {
        p_local_id: t.local,
        p_ouverts_seulement: ouverts,
      })
      const ids = lignes.map((l) => l.id)
      const voulu =
        att === null ? [] : att.listes[nom][ouverts ? 'ouverts' : 'tous']
      if (new Set(ids).size !== ids.length)
        ecarts.push([`${nom}(${ouverts})`, 'doublon'])
      if (trie(ids) !== trie(voulu))
        ecarts.push([
          `${nom}(${ouverts})`,
          `${ids.length} ligne(s) au lieu de ${voulu.length}`,
        ])
      // Pagination : la page (1, 1) est la 2e ligne de la liste complète.
      if (!ouverts && ids.length >= 2) {
        const page = await rpc(client, nom, {
          p_local_id: t.local,
          p_ouverts_seulement: false,
          p_limite: 1,
          p_decalage: 1,
        })
        if (page.length !== 1 || page[0].id !== ids[1])
          ecarts.push([`${nom}(page)`, 'page 2 de taille 1 ≠ 2e ligne'])
      }
    }
  }
  return ecarts
}

function trieObjet(o) {
  if (o === null || typeof o !== 'object') return o
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, trieObjet(o[k])]),
  )
}

// -----------------------------------------------------------------------------
// Déroulé
// -----------------------------------------------------------------------------

async function main() {
  const terrain = {}
  for (const site of SITES) terrain[site] = semer(site)
  try {
    const clients = {}
    for (const identite of IDENTITES)
      clients[identite] = await connecter(identite)

    const ecarts = []
    const epingles = []
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
        let marque = '✓'
        for (const [controle, detail] of constats) {
          const cle = `${identite} · ${site} · ${controle}`
          const motif = ECARTS_CONNUS.get(cle)
          if (motif !== undefined) {
            epingles.push(`${cle} : ${detail} — ${motif}`)
            if (marque === '✓') marque = '⚑'
          } else {
            ecarts.push(`${cle} : ${detail}`)
            marque = '✗'
          }
        }
        const att = attendu(identite, site, terrain[site])
        const resume =
          att === null
            ? 'rien'
            : roleDe(identite) === 'demandeur'
              ? 'équip.+DI'
              : 'tout'
        cellules.push(`${site}: ${marque} ${resume}`.padEnd(26))
      }
      lignes.push(`  ${identite.padEnd(12)} ${cellules.join(' ')}`)
    }
    // Plafond : p_limite au-delà de 200 est ramené à 200, sans erreur.
    const borne = await clients.admin.rpc('ot_du_lieu', {
      p_local_id: terrain.A.local,
      p_limite: 100000,
    })
    if (borne.error) ecarts.push(`plafond p_limite : ${borne.error.message}`)

    // Un écart AVANT un épinglé qui passe : un épinglé absent = bug corrigé.
    for (const cle of ECARTS_CONNUS.keys())
      if (!epingles.some((e) => e.startsWith(cle)))
        ecarts.push(`${cle} : passe désormais — retirer l'épinglage`)

    console.log(
      '=== Matrice identité × lieu (✓ = conforme, ⚑ = écart connu épinglé) ===',
    )
    console.log(lignes.join('\n'))
    if (epingles.length) {
      console.log('\nÉpinglés (écarts connus, ne font pas échouer) :')
      for (const e of epingles) console.log(`  ⚑ ${e}`)
    }
    if (ecarts.length) {
      console.log(
        '\nÉcarts NOUVEAUX (findings à rapporter, NE PAS corriger le test) :',
      )
      for (const e of ecarts) console.log(`  ✗ ${e}`)
    }
    console.log(`\n=== ${epingles.length} épinglé(s) ===`)
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
