#!/usr/bin/env node
/**
 * Régénère (ou vérifie) l'instantané des contraintes SQL versionné dans
 * `src/lib/contraintes-sql.json`.
 *
 * POURQUOI un instantané plutôt qu'une lecture en direct : `npm run verify` doit
 * rester hors ligne et déterministe. Mais un test adossé à une source qui dérive
 * n'est pas un garde-fou — c'est le piège qui avait tué le premier jet de
 * celui-ci, adossé à `schema_complete.sql`. D'où la paire :
 *
 *   * `npm run contraintes:instantane` — régénère le fichier depuis la
 *     PRODUCTION (lecture seule). À relancer après chaque migration.
 *   * `npm run contraintes:verifier`   — relit la production et échoue si
 *     l'instantané versionné a dérivé. À jouer au déploiement, pas dans
 *     `verify` (il exige le réseau et l'accès CLI).
 *
 * Les deux passent par `scripts/contraintes-sql.sql`, qui ne contient QUE des
 * SELECT.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const REQUETE = join(RACINE, 'scripts', 'contraintes-sql.sql')
const INSTANTANE = join(RACINE, 'src', 'lib', 'contraintes-sql.json')
const PROJET = 'ybxuojtyevldrbieaykh'

/** Trie récursivement les clés d'un objet : deux lectures donnent le même texte. */
function trier(valeur) {
  if (Array.isArray(valeur)) return valeur.map(trier)
  if (valeur === null || typeof valeur !== 'object') return valeur
  const sortie = {}
  for (const cle of Object.keys(valeur).sort()) sortie[cle] = trier(valeur[cle])
  return sortie
}

/** Lit la production et rend l'objet `{ tables: … }`. */
function lireProduction() {
  const res = spawnSync(
    'npx',
    [
      '--yes',
      'supabase',
      'db',
      'query',
      '--linked',
      '--project-ref',
      PROJET,
      '-f',
      REQUETE,
    ],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  )
  if (res.status !== 0) {
    throw new Error(
      `Lecture de la production impossible (code ${res.status}).\n${res.stderr ?? ''}`,
    )
  }
  // La CLI enveloppe le résultat dans `{ boundary, rows, warning }` et écrit ses
  // messages d'avancement sur stderr : stdout est du JSON pur.
  const enveloppe = JSON.parse(res.stdout)
  const brut = enveloppe.rows?.[0]?.instantane
  if (typeof brut !== 'string') {
    throw new Error("La requête n'a pas rendu de colonne `instantane`.")
  }
  return trier(JSON.parse(brut))
}

/** Sérialisation stable, compatible Prettier (2 espaces, saut de ligne final). */
function serialiser(objet) {
  return `${JSON.stringify(objet, null, 2)}\n`
}

const verifier = process.argv.includes('--verifier')

let lu
try {
  lu = lireProduction()
} catch (erreur) {
  console.error(String(erreur.message ?? erreur))
  process.exit(2)
}

const attendu = {
  _lecture:
    'Instantané des contraintes de colonnes lues sur la PRODUCTION. Régénéré par `npm run contraintes:instantane`. Ne pas éditer à la main.',
  tables: lu.tables,
}

if (!verifier) {
  writeFileSync(INSTANTANE, serialiser(attendu), 'utf8')
  const nbTables = Object.keys(lu.tables).length
  const nbChecks = Object.values(lu.tables).reduce(
    (n, t) => n + Object.keys(t.checks).length,
    0,
  )
  const nbColonnes = Object.values(lu.tables).reduce(
    (n, t) => n + Object.keys(t.colonnes).length,
    0,
  )
  console.log(
    `Instantané écrit : ${nbTables} tables, ${nbColonnes} colonnes, ${nbChecks} contraintes CHECK.`,
  )
  process.exit(0)
}

const surDisque = JSON.parse(readFileSync(INSTANTANE, 'utf8'))
const ecarts = []

const tablesLues = new Set(Object.keys(lu.tables))
const tablesFichier = new Set(Object.keys(surDisque.tables))
for (const t of tablesLues) {
  if (!tablesFichier.has(t)) ecarts.push(`table absente de l'instantané : ${t}`)
}
for (const t of tablesFichier) {
  if (!tablesLues.has(t)) ecarts.push(`table disparue de la production : ${t}`)
}
for (const t of [...tablesLues].filter((t) => tablesFichier.has(t)).sort()) {
  const a = serialiser(lu.tables[t])
  const b = serialiser(surDisque.tables[t])
  if (a !== b) ecarts.push(`table ${t} : définition différente`)
}

if (ecarts.length > 0) {
  console.error(
    "L'instantané versionné a dérivé de la production :\n" +
      ecarts.map((e) => `  - ${e}`).join('\n') +
      '\n\nRelancez `npm run contraintes:instantane`, puis `npm run test` : ' +
      'le test de concordance dira quels schémas Zod sont désormais trop permissifs.',
  )
  process.exit(1)
}

console.log("L'instantané versionné est conforme à la production.")
