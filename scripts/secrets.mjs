#!/usr/bin/env node
// =============================================================================
// Recherche de secrets — repli local de gitleaks (dépôt PUBLIC)
// =============================================================================
// La CI lance gitleaks ; sur le poste, ce script couvre les mêmes familles sans
// rien installer. Aucune valeur trouvée n'est affichée : seulement le fichier,
// la ligne et la famille.
//
//   node scripts/secrets.mjs              fichiers suivis (état de travail)
//   node scripts/secrets.mjs --indexes    contenu indexé (avant commit)
//   node scripts/secrets.mjs --historique tout l'historique git
//
// Seules tolérances : les clés de DÉMONSTRATION de Supabase (JWT dont l'émetteur
// est « supabase-demo », identiques sur toutes les installations et sans
// pouvoir hors de 127.0.0.1) et les gabarits de `.env.example` (xxxx…).
// =============================================================================
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const racine = path.resolve(import.meta.dirname, '..')
const mode = process.argv.includes('--historique')
  ? 'historique'
  : process.argv.includes('--indexes')
    ? 'indexes'
    : 'suivis'

const git = (args) =>
  spawnSync('git', args, {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  }).stdout ?? ''

/** Fichiers jamais scannés : verrous de dépendances et binaires. */
const IGNORES =
  /(^|\/)(package-lock\.json|deno\.lock)$|\.(png|jpe?g|webp|ico|pdf|woff2?|zip)$/i

/** JWT : refusé sauf clé de démonstration Supabase. */
function jwtSuspect(jeton) {
  try {
    const charge = JSON.parse(
      Buffer.from(jeton.split('.')[1], 'base64url').toString(),
    )
    return charge.iss !== 'supabase-demo'
  } catch {
    return false // pas un vrai JWT : ignoré
  }
}

const FAMILLES = [
  {
    nom: 'JWT (clé Supabase réelle ?)',
    rx: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    garder: jwtSuspect,
  },
  { nom: 'clé secrète Supabase', rx: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  {
    nom: 'clé publique Supabase réelle',
    rx: /sb_publishable_[A-Za-z0-9_-]{16,}/g,
    garder: (v) => !/^sb_publishable_x+$/i.test(v),
  },
  {
    nom: 'clé privée',
    rx: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    nom: 'jeton GitHub',
    rx: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  },
  { nom: 'jeton Slack', rx: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { nom: 'clé AWS', rx: /\bAKIA[0-9A-Z]{16}\b/g },
  { nom: 'clé Stripe live', rx: /\b[sr]k_live_[A-Za-z0-9]{16,}/g },
  { nom: 'clé Anthropic / OpenAI', rx: /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}/g },
  {
    nom: 'variable secrète renseignée',
    rx: /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|DB_PASSWORD|POSTGRES_PASSWORD)\s*=\s*["']?[^\s"'$<{]{16,}/g,
  },
  {
    nom: 'URL Postgres avec mot de passe (hors local)',
    rx: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@[^\s/'"]+/g,
    garder: (v) => !/@(127\.0\.0\.1|localhost|db)(:|\/|$)/.test(v),
  },
]

function scanner(fichier, texte, alertes) {
  if (IGNORES.test(fichier)) return
  texte.split(/\r?\n/).forEach((ligne, i) => {
    for (const f of FAMILLES) {
      for (const m of ligne.matchAll(f.rx)) {
        if (!f.garder || f.garder(m[0]))
          alertes.push(`${fichier}:${i + 1} — ${f.nom}`)
      }
    }
  })
}

const alertes = []
if (mode === 'historique') {
  // Une ligne ajoutée par commit : « +… ». On garde le commit et le fichier.
  let commit = ''
  let fichier = ''
  for (const ligne of git([
    'log',
    '--all',
    '-p',
    '--no-color',
    '--format=@@commit %h',
  ]).split('\n')) {
    if (ligne.startsWith('@@commit ')) commit = ligne.slice(9)
    else if (ligne.startsWith('+++ b/')) fichier = ligne.slice(6)
    else if (ligne.startsWith('+') && !ligne.startsWith('+++'))
      scanner(`${commit} ${fichier}`, ligne.slice(1), alertes)
  }
} else {
  const liste =
    mode === 'indexes'
      ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
      : git(['ls-files'])
  for (const f of liste
    .split(String.fromCharCode(10))
    .map((x) => x.trim())
    .filter(Boolean)) {
    let texte = ''
    if (mode === 'indexes') texte = git(['show', `:${f}`])
    else if (fs.existsSync(path.join(racine, f)))
      texte = fs.readFileSync(path.join(racine, f), 'utf8')
    scanner(f, texte, alertes)
  }
}

const uniques = [...new Set(alertes)]
if (uniques.length) {
  console.log(`✖ ${uniques.length} secret(s) possible(s) (valeurs masquées) :`)
  for (const a of uniques.slice(0, 30)) console.log(`  ${a}`)
  console.log(
    'Retirer la valeur (et la révoquer si elle est réelle) ; un faux positif se règle dans scripts/secrets.mjs, jamais par un contournement.',
  )
  process.exit(1)
}
console.log(`0 secret trouvé (${mode}).`)
