#!/usr/bin/env node
// =============================================================================
// Base Supabase LOCALE et JETABLE — montée en une commande, sans la prod
// =============================================================================
//   node scripts/base-locale.mjs monter    démarre la pile, charge le schéma,
//                                          neutralise pg_cron, vérifie, sème
//   node scripts/base-locale.mjs tester    déroule les sondes de sécurité
//   node scripts/base-locale.mjs demonter  arrête la pile et jette ses données
//
// Source du schéma : `schema_complete.sql` (racine), appliqué en UN passage.
// La pile vit dans `supabase-local/` (sa propre config, ports 445xx).
//
// GARDE-FOUS
// - Aucune commande ne vise la production : la CLI n'est appelée qu'à travers
//   `supabase()`, qui refuse `--linked`, `--project-ref`, `login`, `link` et
//   `db dump` ; toutes les adresses obtenues doivent être 127.0.0.1/localhost.
// - Les tâches pg_cron sont désarmées sur CETTE base locale seulement.
// =============================================================================
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const PILE = join(RACINE, 'supabase-local')
const SCHEMA = join(RACINE, 'schema_complete.sql')
const SONDES = join(RACINE, 'tests', 'securite')
const WINDOWS = process.platform === 'win32'

/** Policies Storage attendues après chargement (le bloc DO du schéma les avale en silence s'il échoue). */
const POLICIES_STORAGE = [
  'storage_objects_select_documents',
  'storage_objects_insert_documents',
  'storage_objects_update_documents',
  'storage_objects_delete_documents',
  'storage_objects_connecteur_sans_fichier',
]

const ARGS_INTERDITS = ['--linked', '--project-ref', 'login', 'link', 'dump']

function echec(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function etape(message) {
  console.log(`\n▶ ${message}`)
}

/** Appelle la CLI Supabase sur la pile locale ; refuse tout argument qui pourrait viser la prod. */
function supabase(args, { silencieux = false, tolerer = false } = {}) {
  const interdit = args.find((a) => ARGS_INTERDITS.includes(a))
  if (interdit)
    echec(`Argument refusé : « ${interdit} » viserait la production.`)
  const r = spawnSync(
    WINDOWS ? 'npx.cmd' : 'npx',
    ['--yes', 'supabase', ...args, '--workdir', PILE],
    {
      cwd: RACINE,
      encoding: 'utf8',
      stdio: silencieux ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      // Node refuse de lancer un `.cmd` hors shell depuis la 18.20 (EINVAL).
      shell: WINDOWS,
    },
  )
  if (r.status !== 0 && !tolerer)
    echec(
      `supabase ${args.join(' ')} a échoué (code ${r.status}).\n${(r.stderr ?? '').slice(-1500)}`,
    )
  return r
}

/** Adresses de la pile qui tourne, avec le garde-fou « local uniquement ». */
function statut() {
  const r = supabase(['status', '-o', 'json'], { silencieux: true })
  const s = JSON.parse(r.stdout)
  for (const [cle, url] of [
    ['API_URL', s.API_URL],
    ['DB_URL', s.DB_URL],
  ]) {
    if (!/^[a-z]+:\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(url ?? ''))
      echec(`Cible refusée : ${cle} = ${url} n'est pas une adresse locale.`)
  }
  return s
}

/** Exécute du SQL (fichier ou commande) avec psql, arrêt à la première erreur. */
function psql(dbUrl, { fichier, sql }) {
  const args = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', dbUrl]
  if (fichier) args.push('-f', fichier)
  if (sql) args.push('-c', sql)
  return spawnSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    maxBuffer: 64 * 1024 * 1024,
  })
}

function prerequis() {
  for (const [outil, args] of [
    ['docker', ['info', '--format', '{{.ServerVersion}}']],
    ['psql', ['--version']],
  ]) {
    try {
      execFileSync(outil, args, { stdio: 'ignore' })
    } catch {
      echec(
        outil === 'docker'
          ? 'Docker ne répond pas : lancer Docker Desktop.'
          : 'psql introuvable dans le PATH (client PostgreSQL requis).',
      )
    }
  }
  if (!existsSync(join(PILE, 'supabase')))
    echec(`Configuration de la pile absente : ${PILE}/supabase`)
}

function lancerNode(script, cwd) {
  const r = spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, MARTIN_LOCAL_DIR: PILE },
  })
  return { code: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// -----------------------------------------------------------------------------
// monter
// -----------------------------------------------------------------------------
function monter() {
  const debut = Date.now()
  prerequis()

  etape('Pile précédente jetée (si elle tournait)')
  supabase(['stop', '--no-backup'], { silencieux: true, tolerer: true })

  etape(
    'Démarrage de la pile locale (premier lancement : téléchargement des images)',
  )
  // Silencieux : `start` imprime les clés de démonstration, qui n'ont rien à
  // faire dans un journal (même locales, elles affolent les scanners).
  supabase(['start'], { silencieux: true })
  const s = statut()
  console.log(
    `  API ${s.API_URL} · base ${s.DB_URL.replace(/:[^:@/]+@/, ':***@')}`,
  )

  etape('Chargement de schema_complete.sql (un seul passage)')
  const charge = psql(s.DB_URL, { fichier: SCHEMA })
  if (charge.status !== 0)
    echec(
      `Le schéma ne s'applique pas :\n${charge.stderr
        .split('\n')
        .filter((l) => !l.includes('NOTICE'))
        .join('\n')
        .slice(-2000)}`,
    )
  // Les blocs DO … EXCEPTION du schéma transforment certains échecs en NOTICE.
  const avales = charge.stderr
    .split('\n')
    .filter((l) => /non créée|non appliqué|non créées/.test(l))
  if (avales.length)
    echec(`Échecs avalés pendant le chargement :\n${avales.join('\n')}`)
  console.log('  ✓ schéma appliqué sans erreur')

  etape('Neutralisation des tâches pg_cron (base locale uniquement)')
  const cron = psql(s.DB_URL, {
    sql: 'SELECT count(cron.unschedule(jobid)) FROM cron.job; SELECT count(*) FROM cron.job;',
  })
  if (cron.status !== 0) echec(`cron.unschedule : ${cron.stderr}`)
  const [desarmees, restantes] = cron.stdout.trim().split('\n')
  if (restantes !== '0')
    echec(`${restantes} tâche(s) pg_cron encore planifiée(s).`)
  console.log(`  ✓ ${desarmees} tâche(s) désarmée(s), 0 restante`)

  etape('Vérifications de ce qui peut échouer en silence')
  const verif = psql(s.DB_URL, {
    sql: `
      SELECT 'trigger on_auth_user_created', count(*) FROM pg_trigger
        WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass;
      SELECT 'bucket documents', count(*) FROM storage.buckets WHERE id = 'documents';
      SELECT 'policies storage.objects', count(*) FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects';
      SELECT 'policies storage manquantes', count(*) FROM unnest(ARRAY[${POLICIES_STORAGE.map((p) => `'${p}'`).join(',')}]) AS p(nom)
        WHERE NOT EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = p.nom);
      SELECT 'lignes statuts_di', count(*) FROM public.statuts_di;
      SELECT 'secret Dmbook dans le coffre', count(*) FROM vault.secrets WHERE name LIKE 'dmbook%';
    `,
  })
  if (verif.status !== 0) echec(`Vérifications : ${verif.stderr}`)
  const mesures = Object.fromEntries(
    verif.stdout
      .trim()
      .split('\n')
      .map((l) => l.split('|'))
      .map(([k, v]) => [k, Number(v)]),
  )
  const regles = [
    ['trigger on_auth_user_created', (n) => n === 1],
    ['bucket documents', (n) => n === 1],
    ['policies storage.objects', (n) => n > 0],
    ['policies storage manquantes', (n) => n === 0],
    ['lignes statuts_di', (n) => n > 0],
    // Sans ce secret, dmbook_appeler() n'appelle jamais la fonction de prod.
    ['secret Dmbook dans le coffre', (n) => n === 0],
  ]
  let ko = 0
  for (const [nom, ok] of regles) {
    const bon = ok(mesures[nom])
    if (!bon) ko++
    console.log(`  ${bon ? '✓' : '✗'} ${nom} : ${mesures[nom]}`)
  }
  if (ko) echec(`${ko} vérification(s) en échec.`)

  etape('Semis des comptes et données de test (tests/securite/semis.mjs)')
  const semis = lancerNode(join(SONDES, 'semis.mjs'), SONDES)
  process.stdout.write(semis.sortie)
  if (semis.code !== 0) echec('Le semis a échoué.')

  const duree = Math.round((Date.now() - debut) / 1000)
  console.log(`\n✓ Base locale prête en ${duree} s — ${s.API_URL}`)
  console.log('  Suite : node scripts/base-locale.mjs tester')
}

// -----------------------------------------------------------------------------
// tester
// -----------------------------------------------------------------------------

/** Accès attendu au document d'un site, par identité (stockage.mjs ne trie pas lui-même). */
function accesAttendu(identite, site) {
  if (identite === 'admin') return true
  if (identite === 'anonyme') return false
  return identite.endsWith(site)
}

const SONDES_A_LANCER = [
  {
    script: 'escalade.mjs',
    ecarts: (s) => Number(/=== (\d+) ecart\(s\)/.exec(s)?.[1] ?? NaN),
  },
  {
    script: 'sonde-rls.mjs',
    ecarts: (s) => Number(/=== (\d+) finding\(s\)/.exec(s)?.[1] ?? NaN),
  },
  {
    script: 'stockage.mjs',
    ecarts: (s) =>
      [...s.matchAll(/^ ?(FUITE|ok) +(\S+) +-> .* site ([AB]) : \d+/gm)].filter(
        ([, verdict, qui, site]) =>
          (verdict === 'FUITE') !== accesAttendu(qui, site),
      ).length,
  },
]

function tester() {
  prerequis()
  statut() // garde-fou local avant toute sonde
  let total = 0
  const bilan = []
  for (const { script, ecarts } of SONDES_A_LANCER) {
    etape(`Sonde ${script}`)
    const r = lancerNode(join(SONDES, script), SONDES)
    process.stdout.write(r.sortie)
    const n = r.code === 0 ? ecarts(r.sortie) : NaN
    const verdict = Number.isNaN(n)
      ? 'ÉCHEC D’EXÉCUTION'
      : n === 0
        ? 'OK'
        : `${n} écart(s)`
    if (verdict !== 'OK') total++
    bilan.push(
      `  ${verdict === 'OK' ? '✓' : '✗'} ${script.padEnd(16)} ${verdict}`,
    )
  }
  console.log('\n=== Bilan des sondes ===')
  console.log(bilan.join('\n'))
  console.log(
    '  · edge-functions.mjs non lancée : elle exige `supabase functions serve --no-verify-jwt` (voir tests/securite/README.md).',
  )
  if (total)
    echec(
      `${total} sonde(s) en écart : à examiner (ne pas corriger une policy à l'aveugle).`,
    )
  console.log('\n✓ Toutes les sondes conformes.')
}

// -----------------------------------------------------------------------------
// demonter
// -----------------------------------------------------------------------------
function demonter() {
  etape('Arrêt de la pile locale et suppression de ses données')
  supabase(['stop', '--no-backup'])
  console.log('\n✓ Pile arrêtée, volumes supprimés.')
}

const commandes = { monter, tester, demonter }
const commande = process.argv[2]
if (!commandes[commande]) {
  console.error('Usage : node scripts/base-locale.mjs monter|tester|demonter')
  process.exit(2)
}
commandes[commande]()
