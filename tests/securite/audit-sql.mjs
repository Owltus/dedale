// =============================================================================
// Audit SQL du catalogue — LECTURE SEULE, base LOCALE JETABLE
// =============================================================================
// Lancé par `npm run base:tester` (après `npm run base:monter`), ou seul :
//   MARTIN_LOCAL_DIR=supabase-local node tests/securite/audit-sql.mjs
//   … --geler   réécrit la liste des exceptions avec les écarts observés
//               (motif « À MOTIVER » à remplacer à la main — jamais livré tel quel)
//
// Contrôle les règles du skill migration-sql et de CLAUDE.md sur DEUX sources :
// - la base locale montée depuis schema_complete.sql (pg_catalog : c'est l'état
//   réel, après exécution — un DO qui révoque, une boucle de GRANT…) ;
// - le TEXTE de schema_complete.sql et, s'il existe sur la machine, du dossier
//   migrations/ (gitignoré, local) : ce que le catalogue ne garde pas
//   (idempotence d'écriture).
//
// CLIQUET : chaque écart connu et accepté vit dans audit-sql-exceptions.json,
// avec son motif. Un écart absent de la liste est NOUVEAU (bloquant) ; une
// exception qui n'est plus observée est PÉRIMÉE (bloquante aussi : la liste ne
// peut que rétrécir, on la retire).
//
// Sortie : « === N gelé(s) === » puis « === N écart(s) === » ; code 0 sans
// écart, 3 avec, 1 en cas de panne.
//
// GARDE-FOU : la cible vient de cible.mjs, qui refuse tout ce qui n'est pas
// 127.0.0.1/localhost. Aucune écriture : uniquement des SELECT sur le catalogue.
// =============================================================================
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { DB } from './cible.mjs'

const RACINE = new URL('../../', import.meta.url)
const FICHIER_EXCEPTIONS = new URL(
  './audit-sql-exceptions.json',
  import.meta.url,
)
const GELER = process.argv.includes('--geler')

/** Migrations « récentes » soumises aux règles d'écriture (idempotence). */
const MIGRATION_RECENTE_DEPUIS = 150

const REGLES = {
  'rls-absente': 'table publique sans RLS',
  'rls-sans-policy': 'table publique avec RLS mais aucune policy',
  'insert-sans-with-check': 'policy INSERT sans WITH CHECK',
  'cloisonnement-site':
    'policy d’une table à site_id sans has_site_access / mes_site_ids',
  'helper-auth': 'appel auth.xxx() autre que auth.uid()',
  'reference-non-qualifiee':
    'fonction à search_path vide qui cite un objet public sans « public. »',
  'secdef-search-path': 'SECURITY DEFINER sans search_path vide figé',
  'vue-sans-security-invoker': 'vue sans security_invoker',
  'commentaire-absent': 'fonction ou policy sans COMMENT ON',
  idempotence:
    'écriture non rejouable (CREATE sans OR REPLACE / DROP IF EXISTS)',
  'deleted-at': 'colonne deleted_at (doctrine hard-delete)',
  'anon-execute': 'fonction exécutable par anon',
  'fonction-dupliquee':
    'fonction déclarée plusieurs fois (surcharge ou schéma)',
}

// -----------------------------------------------------------------------------
// Accès catalogue
// -----------------------------------------------------------------------------
function requete(sql) {
  const r = spawnSync(
    'psql',
    // Séparateurs ASCII d'unité et d'enregistrement : les corps de fonction
    // contiennent des retours à la ligne et des barres verticales.
    [
      '-X',
      '-q',
      '-At',
      '-F',
      '\u001f',
      '-R',
      '\u001e',
      '-v',
      'ON_ERROR_STOP=1',
      DB,
      '-c',
      sql,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  if (r.status !== 0) throw new Error(`psql : ${r.stderr}`)
  return r.stdout
    .replace(/\r?\n$/, '') // psql sous Windows termine par \r\n
    .split('\u001e')
    .filter((l) => l !== '')
    .map((l) => l.split('\u001f'))
}

const ecarts = []
const constater = (regle, objet, detail = '') =>
  ecarts.push({ regle, objet, detail })

/** Fonctions des extensions : hors de notre responsabilité. */
const HORS_EXTENSION = `NOT EXISTS (SELECT 1 FROM pg_depend d
  WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`

function auditCatalogue() {
  for (const [t] of requete(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity`))
    constater('rls-absente', t)

  for (const [t] of requete(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)`))
    constater('rls-sans-policy', t)

  for (const [t, p] of requete(`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname IN ('public','storage') AND cmd = 'INSERT' AND with_check IS NULL`))
    constater('insert-sans-with-check', `${t}.${p}`)

  // Cloisonnement : sur une table à site_id, toute policy PERMISSIVE autre que
  // l'« admin voit tout » doit citer has_site_access ou mes_site_ids (forme
  // « une fois par requête », 172) — dans USING pour lire/modifier/supprimer,
  // dans WITH CHECK (ou USING à défaut) pour écrire.
  const SCOPE = '(has_site_access|mes_site_ids)'
  for (const [t, p, cmd, q, w] of requete(`
    SELECT p.tablename, p.policyname, p.cmd, coalesce(p.qual, ''),
           coalesce(p.with_check, p.qual, '')
    FROM pg_policies p
    JOIN pg_attribute a ON a.attrelid = format('public.%I', p.tablename)::regclass
     AND a.attname = 'site_id' AND NOT a.attisdropped
    WHERE p.schemaname = 'public' AND p.permissive = 'PERMISSIVE'`)) {
    const adminSeul =
      /^\(\( SELECT "current_role"\(\) AS "current_role"\) = 'admin'::text\)$/.test(
        q,
      )
    if (adminSeul) continue
    const manque = []
    if (['SELECT', 'DELETE', 'UPDATE', 'ALL'].includes(cmd) && !q.match(SCOPE))
      manque.push('USING')
    if (['INSERT', 'UPDATE', 'ALL'].includes(cmd) && !w.match(SCOPE))
      manque.push('WITH CHECK')
    if (manque.length)
      constater(
        'cloisonnement-site',
        `${t}.${p}`,
        `${cmd} : ${manque.join(' + ')}`,
      )
  }

  for (const [t, p, expr] of requete(`
    SELECT tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '')
    FROM pg_policies WHERE schemaname IN ('public','storage')`)) {
    const autres = [...expr.matchAll(/auth\.(\w+)\s*\(/g)]
      .map((m) => m[1])
      .filter((f) => f !== 'uid')
    if (autres.length)
      constater(
        'helper-auth',
        `policy ${t}.${p}`,
        [...new Set(autres)].join(', '),
      )
  }

  // Fonctions publiques : corps, configuration, droits.
  const fonctions = requete(`
    SELECT p.oid::regprocedure::text, p.proname, p.prosecdef,
           coalesce(array_to_string(p.proconfig, ','), ''),
           p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype),
           has_function_privilege('anon', p.oid, 'EXECUTE'),
           obj_description(p.oid, 'pg_proc') IS NOT NULL,
           coalesce(p.prosrc, '')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND ${HORS_EXTENSION}
    ORDER BY 1`)
  const tables = requete(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')`).map(
    ([t]) => t,
  )
  const nomsFonctions = [...new Set(fonctions.map(([, nom]) => nom))]

  for (const [
    sig,
    nom,
    secdef,
    config,
    trigger,
    anon,
    commente,
    src,
  ] of fonctions) {
    const cheminVide = /(^|,)search_path=("")?(,|$)/.test(config)
    if (secdef === 't' && !cheminVide)
      constater('secdef-search-path', sig, config || 'aucun search_path')
    if (trigger === 'f' && anon === 't') constater('anon-execute', sig)
    if (commente === 'f') constater('commentaire-absent', `fonction ${sig}`)
    for (const m of src.matchAll(/auth\.(\w+)\s*\(/g))
      if (m[1] !== 'uid')
        constater('helper-auth', `fonction ${sig}`, `auth.${m[1]}()`)

    // Avec search_path = '', un objet public non qualifié est introuvable À
    // L'EXÉCUTION (la création, elle, passe) : panne silencieuse jusqu'au
    // premier appel. Commentaires et littéraux retirés avant la recherche.
    if (!cheminVide) continue
    const code = src
      .replace(/--[^\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/'(?:[^']|'')*'/g, "''")
    const fautes = new Set()
    for (const f of nomsFonctions)
      if (new RegExp(`(?<![\\w."$])${f}\\s*\\(`).test(code))
        fautes.add(`${f}()`)
    for (const t of tables)
      if (
        new RegExp(
          `\\b(FROM|JOIN|INTO|UPDATE|TABLE)\\s+(ONLY\\s+)?${t}(?![\\w.])`,
          'i',
        ).test(code)
      )
        fautes.add(t)
    // `current_role` sans parenthèses = mot-clé SQL (rôle Postgres courant),
    // pas le helper métier : comparaison toujours fausse, sans erreur.
    if (/(?<![\w."])current_role(?!\s*\()/i.test(code))
      fautes.add('current_role (mot-clé SQL, pas public.current_role())')
    // Noms de fonctions locales homonymes de colonnes : ignorer les appels
    // qualifiés par un alias (x.f()) est déjà fait par le lookbehind.
    fautes.delete(`${nom}()`) // récursion éventuelle, signalée ailleurs si besoin
    if (fautes.size)
      constater('reference-non-qualifiee', sig, [...fautes].sort().join(', '))
  }

  for (const [t, p] of requete(`
    SELECT c.relname, pol.polname FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public','storage') AND obj_description(pol.oid, 'pg_policy') IS NULL`))
    constater('commentaire-absent', `policy ${t}.${p}`)

  for (const [v] of requete(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                    WHERE option_name = 'security_invoker'), 'false') NOT IN ('true','on')`))
    constater('vue-sans-security-invoker', v)

  for (const [t] of requete(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'deleted_at'`))
    constater('deleted-at', t)

  // Pas de règle « FK sans ON DELETE explicite » : NO ACTION (le défaut) EST le
  // « bloquer » de la doctrine, et c'est la forme à garder. RESTRICT se contrôle
  // immédiatement, y compris au milieu d'une cascade (supprimer un site qui
  // efface ses lieux ET leurs événements échouerait) ; NO ACTION se contrôle en
  // fin d'instruction et laisse passer la cascade. Décision du 25/11/2026.

  for (const [nom, n] of requete(`
    SELECT p.proname, count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND ${HORS_EXTENSION}
    GROUP BY 1 HAVING count(*) > 1`))
    constater('fonction-dupliquee', nom, `${n} signatures dans public`)
  // Homonymes dans auth : un ancien helper auth.xxx() resté en place serait
  // appelé à la place de public.xxx() par une policy non qualifiée.
  for (const [nom] of requete(`
    SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname NOT IN ('uid','role','email','jwt')
      AND EXISTS (SELECT 1 FROM pg_proc q JOIN pg_namespace m ON m.oid = q.pronamespace
                  WHERE m.nspname = 'public' AND q.proname = p.proname)`))
    constater('fonction-dupliquee', nom, 'homonyme dans auth et public')
}

// -----------------------------------------------------------------------------
// Texte : schema_complete.sql et migrations/ (si présentes sur la machine)
// -----------------------------------------------------------------------------
function auditTexte() {
  const schema = readFileSync(new URL('schema_complete.sql', RACINE), 'utf8')
  for (const m of schema.matchAll(/^\s*CREATE\s+FUNCTION\s+([\w."]+)/gim))
    constater(
      'idempotence',
      `schema_complete.sql ${m[1]}`,
      'CREATE FUNCTION sans OR REPLACE',
    )

  const dossier = new URL('migrations/', RACINE)
  if (!existsSync(dossier)) {
    console.log(
      '  · migrations/ absent sur cette machine : idempotence contrôlée sur le schéma seul.',
    )
    return
  }
  for (const f of readdirSync(dossier)
    .filter((x) => /^\d{3}_.*\.sql$/.test(x))
    .sort()) {
    if (
      Number(f.slice(0, 3)) < MIGRATION_RECENTE_DEPUIS ||
      /retour_arriere/.test(f)
    )
      continue
    const texte = readFileSync(new URL(f, dossier), 'utf8').replace(
      /--[^\n]*/g,
      '',
    )
    for (const m of texte.matchAll(/^\s*CREATE\s+FUNCTION\s+([\w."]+)/gim))
      constater(
        'idempotence',
        `${f} ${m[1]}`,
        'CREATE FUNCTION sans OR REPLACE',
      )
    for (const m of texte.matchAll(
      /CREATE\s+POLICY\s+("?[\w]+"?)\s+ON\s+([\w."]+)/gi,
    )) {
      const nom = m[1].replaceAll('"', '')
      if (
        !new RegExp(
          `DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"?${nom}"?\\s`,
          'i',
        ).test(texte)
      )
        constater(
          'idempotence',
          `${f} policy ${nom}`,
          'CREATE POLICY sans DROP POLICY IF EXISTS',
        )
    }
  }
}

// -----------------------------------------------------------------------------
// Cliquet
// -----------------------------------------------------------------------------
const cle = (e) => `${e.regle}\u0000${e.objet}`

function main() {
  console.log(
    '=== Audit SQL (catalogue de la base locale + texte du schéma) ===\n',
  )
  auditCatalogue()
  auditTexte()

  const inconnues = ecarts.filter((e) => !REGLES[e.regle])
  if (inconnues.length)
    throw new Error(`règle inconnue : ${inconnues[0].regle}`)

  if (GELER) {
    const anciennes = existsSync(FICHIER_EXCEPTIONS)
      ? new Map(
          JSON.parse(readFileSync(FICHIER_EXCEPTIONS, 'utf8')).map((e) => [
            cle(e),
            e.motif,
          ]),
        )
      : new Map()
    const gel = ecarts
      .map((e) => ({
        regle: e.regle,
        objet: e.objet,
        motif: anciennes.get(cle(e)) ?? 'À MOTIVER',
      }))
      .sort((a, b) => cle(a).localeCompare(cle(b)))
    writeFileSync(FICHIER_EXCEPTIONS, `${JSON.stringify(gel, null, 2)}\n`)
    console.log(
      `${gel.length} exception(s) écrites dans audit-sql-exceptions.json`,
    )
    return 0
  }

  const exceptions = existsSync(FICHIER_EXCEPTIONS)
    ? JSON.parse(readFileSync(FICHIER_EXCEPTIONS, 'utf8'))
    : []
  const nonMotivees = exceptions.filter(
    (e) => !e.motif || e.motif === 'À MOTIVER',
  )
  const connues = new Set(exceptions.map(cle))
  const observes = new Set(ecarts.map(cle))
  const nouveaux = ecarts.filter((e) => !connues.has(cle(e)))
  const perimees = exceptions.filter((e) => !observes.has(cle(e)))

  const parRegle = {}
  for (const e of ecarts) parRegle[e.regle] = (parRegle[e.regle] ?? 0) + 1
  for (const [r, libelle] of Object.entries(REGLES)) {
    const n = parRegle[r] ?? 0
    const neufs = nouveaux.filter((e) => e.regle === r).length
    console.log(
      `  ${neufs ? '✗' : '✓'} ${r.padEnd(26)} ${String(n).padStart(4)} observé(s)${neufs ? `, ${neufs} NOUVEAU(X)` : ''} — ${libelle}`,
    )
  }
  for (const e of nouveaux)
    console.log(
      `  NOUVEAU   [${e.regle}] ${e.objet}${e.detail ? ` — ${e.detail}` : ''}`,
    )
  for (const e of perimees)
    console.log(
      `  PÉRIMÉE   [${e.regle}] ${e.objet} — n'est plus observée : la retirer de la liste`,
    )
  for (const e of nonMotivees)
    console.log(`  NON MOTIVÉE [${e.regle}] ${e.objet}`)

  const total = nouveaux.length + perimees.length + nonMotivees.length
  console.log(`\n=== ${ecarts.length - nouveaux.length} gelé(s) ===`)
  console.log(`=== ${total} écart(s) ===`)
  return total ? 3 : 0
}

try {
  process.exitCode = main()
} catch (e) {
  console.error('ECHEC AUDIT :', e.message)
  process.exitCode = 1
}
