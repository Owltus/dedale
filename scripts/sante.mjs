#!/usr/bin/env node
// =============================================================================
// Bilan de santé du dépôt — une commande, un verdict par point.
// =============================================================================
// Rejoue, de façon permanente, le bilan de santé du 25/11/2026 : chaque point
// (1 installation · 2 compilation · 3 tests · 4 non-régression · 5 conventions ·
// 6 restes du passé · 7 sécurité) reçoit OK, ÉCHEC ou NON VÉRIFIÉ, avec un
// extrait du résultat réel. Un outil absent n'est JAMAIS compté OK.
//
//   npm run sante            avant une poussée   (~2 min)
//   npm run sante:rapide     avant un commit     (fichiers indexés, < 20 s)
//   npm run sante:complet    CI / avant une mise en prod (clone propre,
//                            tests ×2, couverture, base locale si Docker)
//   … -- --strict            « non vérifié » compte comme un échec (CI)
//
// Lecture seule : aucune commande ne parle à la production.
// Rapport machine : reports/sante.json (gitignoré).
// =============================================================================
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const racine = path.resolve(import.meta.dirname, '..')
const args = new Set(process.argv.slice(2))
const niveau = args.has('--rapide')
  ? 'rapide'
  : args.has('--complet')
    ? 'complet'
    : 'defaut'
const strict = args.has('--strict')
const RANG = { rapide: 0, defaut: 1, complet: 2 }

const POINTS = {
  1: 'Installation de zéro',
  2: 'Compilation et propreté',
  3: 'Tests',
  4: 'Comportement inchangé',
  5: 'Conventions',
  6: 'Restes du passé',
  7: 'Sécurité et dépendances',
}

// ── Outils ───────────────────────────────────────────────────────────────────
function lancer(cmd, { cwd = racine, env } = {}) {
  const debut = Date.now()
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env },
    maxBuffer: 64 * 1024 * 1024,
  })
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(
    /\x1b\[[0-9;]*m/g,
    '',
  )
  return { code: r.status ?? 1, sortie, duree: Date.now() - debut }
}
const present = (cmd) =>
  lancer(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`)
    .code === 0
const existe = (p) => fs.existsSync(path.join(racine, p))
const pkg = JSON.parse(
  fs.readFileSync(path.join(racine, 'package.json'), 'utf8'),
)
const aScript = (nom) => Boolean(pkg.scripts?.[nom])
function extrait(sortie, motif, n = 6) {
  const lignes = sortie.split(/\r?\n/).filter((l) => l.trim())
  const choisies = motif ? lignes.filter((l) => motif.test(l)) : []
  return (choisies.length ? choisies : lignes.slice(-n)).slice(-n).join('\n')
}
function indexes() {
  const r = lancer('git diff --cached --name-only --diff-filter=ACMR')
  return r.sortie
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ── Les contrôles ────────────────────────────────────────────────────────────
// statut : 'ok' | 'echec' | 'non' (non vérifié) ; chaque contrôle dit pourquoi.
const OK = (extrait) => ({ statut: 'ok', extrait })
const ECHEC = (extrait) => ({ statut: 'echec', extrait })
const NON = (extrait) => ({ statut: 'non', extrait })
const depuis = (r, motif) =>
  (r.code === 0 ? OK : ECHEC)(extrait(r.sortie, motif))

/** Fichiers que la consigne du PO interdit de versionner (filet en plus du .gitignore). */
const INTERDITS = [
  /^migrations\//,
  /^plan\//,
  /(^|\/)\.env\.local$/,
  /(^|\/)deno\.lock$/,
  /^docs\/Feuille_de_Releves/,
  /^docs\/Releves_Temperatures_TH_2026\//,
  /^contexte\//,
]

const CONTROLES = [
  // ── rapide (avant commit) ─────────────────────────────────────────────────
  {
    point: 7,
    niveau: 'rapide',
    nom: 'Fichiers interdits hors du dépôt',
    run() {
      const fichiers =
        niveau === 'rapide'
          ? indexes()
          : lancer('git ls-files').sortie.split(/\r?\n/)
      const fautifs = fichiers.filter((f) => INTERDITS.some((rx) => rx.test(f)))
      return fautifs.length
        ? ECHEC(`versionnés : ${fautifs.slice(0, 10).join(', ')}`)
        : OK(`${fichiers.length} fichiers vérifiés, 0 interdit`)
    },
  },
  {
    point: 2,
    niveau: 'rapide',
    nom: 'Format (Prettier) des fichiers indexés',
    seulement: 'rapide',
    run() {
      const f = indexes().filter(
        (x) => /\.(ts|tsx|js|mjs|json|md|css|html)$/.test(x) && existe(x),
      )
      if (!f.length) return OK('aucun fichier concerné')
      return depuis(
        lancer(
          `npx prettier --check --ignore-unknown ${f.map((x) => `"${x}"`).join(' ')}`,
        ),
        /warn|error|Code style/i,
      )
    },
  },
  {
    point: 2,
    niveau: 'rapide',
    nom: 'ESLint des fichiers indexés',
    seulement: 'rapide',
    run() {
      const f = indexes().filter(
        (x) =>
          /\.(ts|tsx)$/.test(x) &&
          !x.startsWith('supabase/') &&
          !x.startsWith('tests/securite/') &&
          existe(x),
      )
      if (!f.length) return OK('aucun fichier concerné')
      return depuis(
        lancer(
          `npx eslint --max-warnings=0 ${f.map((x) => `"${x}"`).join(' ')}`,
        ),
        /problem|error|warning/i,
      )
    },
  },
  {
    point: 5,
    niveau: 'rapide',
    nom: 'Conventions du CLAUDE.md',
    run() {
      if (!existe('src/lib/conventions.test.ts'))
        return NON('contrôle pas encore en place (plan garde-fous, étape 3)')
      return depuis(
        lancer('npx vitest run src/lib/conventions.test.ts --reporter=dot'),
        /Tests|failed|FAIL|écart/i,
      )
    },
  },
  {
    point: 7,
    niveau: 'rapide',
    nom: 'Secrets (gitleaks)',
    run() {
      if (!present('gitleaks')) {
        if (!existe('scripts/secrets.mjs'))
          return NON('gitleaks absent et pas de scan de repli (étape 8)')
        return depuis(
          lancer(
            `node scripts/secrets.mjs ${niveau === 'rapide' ? '--indexes' : ''}`,
          ),
        )
      }
      const cmd =
        niveau === 'rapide'
          ? 'gitleaks protect --staged --redact --no-banner'
          : 'gitleaks detect --redact --no-banner'
      return depuis(lancer(cmd), /leaks|no leaks|WRN|finding/i)
    },
  },

  // ── défaut (avant poussée) ────────────────────────────────────────────────
  {
    point: 2,
    niveau: 'defaut',
    nom: 'Types (tsc -b)',
    run() {
      const r = lancer('npm run typecheck')
      return r.code === 0
        ? OK('0 erreur')
        : ECHEC(extrait(r.sortie, /error TS/))
    },
  },
  {
    point: 2,
    niveau: 'defaut',
    nom: 'ESLint (tout le front)',
    run() {
      const r = lancer('npx eslint .')
      const m = r.sortie.match(
        /(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/,
      )
      if (r.code !== 0) return ECHEC(extrait(r.sortie, /error|problem/i))
      return OK(m ? `${m[2]} erreur, ${m[3]} avertissement(s)` : '0 problème')
    },
  },
  {
    point: 2,
    niveau: 'defaut',
    nom: 'Format (Prettier, tout le dépôt)',
    run: () =>
      depuis(lancer('npm run format:check'), /warn|All matched|error/i),
  },
  {
    point: 2,
    niveau: 'defaut',
    nom: 'Edge Functions : lint, types, format (Deno)',
    run() {
      if (!present('deno'))
        return NON('Deno absent du PATH (prérequis, cf. README)')
      const cwd = path.join(racine, 'supabase', 'functions')
      const lint = lancer(
        'deno lint --compact --rules-exclude=no-import-prefix',
        { cwd },
      )
      const check = lancer(
        'deno check --quiet --no-lock --node-modules-dir=none */index.ts',
        { cwd },
      )
      const nLint =
        (lint.sortie.match(/Found (\d+) problem/) ?? [])[1] ??
        (lint.code === 0 ? '0' : '?')
      const resume = `deno lint : ${nLint} problème(s) · deno check : ${check.code === 0 ? 'OK' : 'ÉCHEC'}`
      return lint.code === 0 && check.code === 0
        ? OK(resume)
        : ECHEC(
            `${resume}\n${extrait(lint.sortie + check.sortie, /error|problem/i, 4)}`,
          )
    },
  },
  {
    point: 2,
    niveau: 'defaut',
    nom: 'Build de production',
    run: () => depuis(lancer('npm run build'), /built in|error/i),
  },
  {
    point: 3,
    niveau: 'defaut',
    nom: 'Tests Vitest',
    run() {
      const r = lancer('npx vitest run')
      const ligne = extrait(r.sortie, /Test Files|Tests\s/, 2)
      return (r.code === 0 ? OK : ECHEC)(ligne)
    },
  },
  {
    point: 3,
    niveau: 'defaut',
    nom: 'Tests Deno (Edge Functions)',
    run() {
      if (!present('deno')) return NON('Deno absent du PATH')
      return depuis(lancer('npm run test:deno'), /passed|failed/)
    },
  },
  {
    point: 4,
    niveau: 'defaut',
    nom: 'Concordance schéma SQL ↔ types ↔ Zod',
    // Le contrôle vit dans la suite Vitest (concordance-sql, schema-fonctions-uniques,
    // database-types-copie) : on le rejoue isolément pour l'afficher sous le point 4.
    run: () =>
      depuis(
        lancer(
          'npx vitest run src/lib/concordance-sql.test.ts src/lib/schema-fonctions-uniques.test.ts src/lib/database-types-copie.test.ts --reporter=dot',
        ),
        /Tests|failed/,
      ),
  },
  {
    point: 6,
    niveau: 'defaut',
    nom: 'Code mort et dépendances inutiles (knip)',
    run() {
      if (!existe('knip.json'))
        return NON('knip pas encore configuré (étape 7)')
      return depuis(lancer('npx knip --no-progress'), /Unused|Unlisted|\(\d+\)/)
    },
  },
  {
    point: 6,
    niveau: 'defaut',
    nom: 'TODO / FIXME',
    run() {
      const r = lancer(
        `git grep -nE "\\b(TODO|FIXME|HACK)\\b" -- . ":!package-lock.json" ":!.claude/skills/impeccable" ":!.impeccable" ":!scripts/sante.mjs"`,
      )
      const n = r.sortie.split(/\r?\n/).filter(Boolean).length
      return n === 0
        ? OK('0')
        : ECHEC(`${n} marqueur(s)\n${extrait(r.sortie, null, 5)}`)
    },
  },
  {
    point: 7,
    niveau: 'defaut',
    nom: 'Vulnérabilités du code livré (npm audit --omit=dev)',
    run() {
      const r = lancer('npm audit --omit=dev --json')
      try {
        const v = JSON.parse(r.sortie.slice(r.sortie.indexOf('{'))).metadata
          .vulnerabilities
        const graves = v.high + v.critical
        const resume = `critiques ${v.critical} · hautes ${v.high} · moyennes ${v.moderate} · basses ${v.low}`
        return graves ? ECHEC(resume) : OK(resume)
      } catch {
        return NON('audit illisible (réseau ?)')
      }
    },
  },
  {
    point: 7,
    niveau: 'defaut',
    nom: 'Vulnérabilités de l’outillage (informatif)',
    informatif: true,
    run() {
      const r = lancer('npm audit --json')
      try {
        const v = JSON.parse(r.sortie.slice(r.sortie.indexOf('{'))).metadata
          .vulnerabilities
        return OK(
          `total ${v.total} (critiques ${v.critical}, hautes ${v.high}) — non bloquant, à monter mensuellement`,
        )
      } catch {
        return NON('audit illisible (réseau ?)')
      }
    },
  },
  {
    point: 7,
    niveau: 'defaut',
    nom: 'Dépendances en retard (informatif)',
    informatif: true,
    run() {
      const r = lancer('npm outdated --json')
      try {
        const o = JSON.parse(r.sortie || '{}')
        const majeures = Object.entries(o).filter(
          ([, v]) =>
            String(v.latest).split('.')[0] !== String(v.current).split('.')[0],
        )
        return OK(
          `${Object.keys(o).length} en retard, dont ${majeures.length} majeure(s) : ${majeures
            .map(([n]) => n)
            .slice(0, 6)
            .join(', ')}`,
        )
      } catch {
        return NON('npm outdated illisible')
      }
    },
  },

  // ── complet (CI / avant mise en prod) ─────────────────────────────────────
  {
    point: 1,
    niveau: 'complet',
    nom: 'Clone propre → npm ci → build',
    run() {
      const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'dedale-sante-'))
      try {
        const etapes = [
          ['clone', lancer(`git clone -q "${racine}" "${dossier}"`)],
          ['npm ci', lancer('npm ci --no-audit --no-fund', { cwd: dossier })],
          // Le build ne lit les variables qu'à l'exécution : des valeurs factices suffisent.
          [
            'build',
            lancer('npm run build', {
              cwd: dossier,
              env: {
                VITE_SUPABASE_URL: 'http://127.0.0.1:1',
                VITE_SUPABASE_ANON_KEY: 'factice',
              },
            }),
          ],
        ]
        const rate = etapes.find(([, r]) => r.code !== 0)
        const resume = etapes
          .map(
            ([n, r]) =>
              `${n} ${r.code === 0 ? 'OK' : 'ÉCHEC'} (${Math.round(r.duree / 1000)} s)`,
          )
          .join(' · ')
        return rate
          ? ECHEC(`${resume}\n${extrait(rate[1].sortie, /error|ERR/i, 4)}`)
          : OK(resume)
      } finally {
        fs.rmSync(dossier, { recursive: true, force: true })
      }
    },
  },
  {
    point: 3,
    niveau: 'complet',
    nom: 'Instabilité : la suite relancée donne le même résultat',
    run() {
      const fichier = (i) => path.join(os.tmpdir(), `dedale-tests-${i}.json`)
      const passes = [1, 2].map((i) => {
        lancer(`npx vitest run --reporter=json --outputFile="${fichier(i)}"`)
        const j = JSON.parse(fs.readFileSync(fichier(i), 'utf8'))
        const etats = new Map()
        for (const f of j.testResults)
          for (const t of f.assertionResults)
            etats.set(`${f.name}::${t.fullName}`, t.status)
        return etats
      })
      const instables = [...passes[0]]
        .filter(([k, s]) => passes[1].get(k) !== s)
        .map(([k]) => k)
      return instables.length
        ? ECHEC(
            `${instables.length} test(s) instable(s)\n${instables.slice(0, 5).join('\n')}`,
          )
        : OK(`${passes[0].size} tests, résultats identiques sur 2 passes`)
    },
  },
  {
    point: 3,
    niveau: 'complet',
    nom: 'Couverture (cliquet par module)',
    run() {
      if (
        !aScript('test:couverture') ||
        !existe('scripts/couverture-cliquet.mjs')
      )
        return NON('couverture pas encore en place (étape 6)')
      const r = lancer('npm run test:couverture')
      if (r.code !== 0) return ECHEC(extrait(r.sortie, /Lines|recul|error/i))
      return depuis(
        lancer('node scripts/couverture-cliquet.mjs'),
        /recul|module|lignes/i,
      )
    },
  },
  {
    point: 3,
    niveau: 'complet',
    nom: 'Base locale : droits (RLS) et intégration',
    run() {
      if (!existe('scripts/base-locale.mjs'))
        return NON('base locale pas encore en place (étape 1)')
      if (lancer('docker info --format "{{.ServerVersion}}"').code !== 0)
        return NON('Docker ne répond pas')
      const monter = lancer('node scripts/base-locale.mjs monter')
      if (monter.code !== 0)
        return ECHEC(
          `montage : ${extrait(monter.sortie, /erreur|error|ÉCHEC/i, 4)}`,
        )
      try {
        return depuis(
          lancer('node scripts/base-locale.mjs tester'),
          /OK|KO|échec|réussi/i,
        )
      } finally {
        lancer('node scripts/base-locale.mjs demonter')
      }
    },
  },
]

// ── Exécution ────────────────────────────────────────────────────────────────
const choisis = CONTROLES.filter(
  (c) =>
    RANG[c.niveau] <= RANG[niveau] && (!c.seulement || c.seulement === niveau),
)
const ICONE = { ok: 'OK          ', echec: 'ÉCHEC       ', non: 'NON VÉRIFIÉ ' }
console.log(
  `\nBilan de santé — niveau « ${niveau} »${strict ? ' (strict)' : ''}\n`,
)

const resultats = []
for (const c of choisis) {
  if (process.stdout.isTTY) process.stdout.write(`  … ${c.nom}\r`)
  let r
  try {
    r = c.run()
  } catch (e) {
    r = ECHEC(
      `le contrôle a planté : ${e instanceof Error ? e.message : String(e)}`,
    )
  }
  resultats.push({
    ...r,
    point: c.point,
    nom: c.nom,
    informatif: Boolean(c.informatif),
  })
  console.log(`  ${ICONE[r.statut]}[${c.point}] ${c.nom}`)
  if (r.extrait && (r.statut !== 'ok' || niveau !== 'rapide')) {
    for (const l of String(r.extrait).split('\n').slice(0, 6))
      console.log(`               ${l}`)
  }
}

console.log('\nVerdict par point :')
for (const [n, titre] of Object.entries(POINTS)) {
  const liste = resultats.filter((r) => String(r.point) === n && !r.informatif)
  if (!liste.length) continue
  const statut = liste.some((r) => r.statut === 'echec')
    ? 'echec'
    : liste.some((r) => r.statut === 'non')
      ? 'non'
      : 'ok'
  console.log(`  ${ICONE[statut]}${n}. ${titre}`)
}

const echecs = resultats.filter(
  (r) =>
    !r.informatif && (r.statut === 'echec' || (strict && r.statut === 'non')),
)
fs.mkdirSync(path.join(racine, 'reports'), { recursive: true })
fs.writeFileSync(
  path.join(racine, 'reports', 'sante.json'),
  JSON.stringify(
    { date: new Date().toISOString(), niveau, strict, resultats },
    null,
    2,
  ),
)
console.log(
  echecs.length
    ? `\n✖ ${echecs.length} contrôle(s) en échec.\n`
    : '\n✔ Aucun échec.\n',
)
process.exit(echecs.length ? 1 : 0)
