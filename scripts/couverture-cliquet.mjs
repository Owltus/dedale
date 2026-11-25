#!/usr/bin/env node
// =============================================================================
// Cliquet de couverture — la couverture ne peut pas reculer, module par module
// =============================================================================
// Décision PO (25/11/2026) : pas d'objectif chiffré arbitraire ; on interdit le
// recul. Lit `reports/couverture/coverage-summary.json` (produit par
// `npm run test:couverture`) et le compare à `couverture-plancher.json`.
//
//   node scripts/couverture-cliquet.mjs            compare ; échoue sur un recul
//   node scripts/couverture-cliquet.mjs --relever  réécrit le plancher (après
//                                                  une hausse, à committer)
//
// Tolérance : 0,5 point (le comptage v8 bouge légèrement d'une exécution à
// l'autre). Un module nouveau entre au plancher à sa première mesure.
// =============================================================================
import fs from 'node:fs'
import path from 'node:path'

const racine = path.resolve(import.meta.dirname, '..')
const RESUME = path.join(
  racine,
  'reports',
  'couverture',
  'coverage-summary.json',
)
const PLANCHER = path.join(racine, 'couverture-plancher.json')
const TOLERANCE = 0.5

if (!fs.existsSync(RESUME)) {
  console.error('Aucune mesure : lancer d’abord `npm run test:couverture`.')
  process.exit(2)
}

/** Regroupe les fichiers par module : features/<x>, sinon les deux premiers niveaux. */
function moduleDe(fichier) {
  const rel = fichier.split(path.sep).join('/').split('/src/')[1]
  if (!rel) return null
  const p = rel.split('/')
  if (p[0] === 'features') return `features/${p[1]}`
  return p.length > 2 ? `${p[0]}/${p[1]}` : p.length === 2 ? p[0] : '(racine)'
}

const mesure = {}
for (const [fichier, v] of Object.entries(
  JSON.parse(fs.readFileSync(RESUME, 'utf8')),
)) {
  if (fichier === 'total') continue
  const m = moduleDe(fichier)
  if (!m) continue
  mesure[m] ??= { l: 0, lt: 0, b: 0, bt: 0 }
  mesure[m].l += v.lines.covered
  mesure[m].lt += v.lines.total
  mesure[m].b += v.branches.covered
  mesure[m].bt += v.branches.total
}
const pct = (a, t) => (t ? Math.round((1000 * a) / t) / 10 : 100)
const actuel = Object.fromEntries(
  Object.entries(mesure)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => [m, { lignes: pct(v.l, v.lt), branches: pct(v.b, v.bt) }]),
)

if (process.argv.includes('--relever') || !fs.existsSync(PLANCHER)) {
  const ancien = fs.existsSync(PLANCHER)
    ? JSON.parse(fs.readFileSync(PLANCHER, 'utf8')).modules
    : {}
  // On ne relève jamais un plancher à la baisse, même avec --relever.
  const modules = Object.fromEntries(
    Object.entries(actuel).map(([m, v]) => [
      m,
      {
        lignes: Math.max(v.lignes, ancien[m]?.lignes ?? 0),
        branches: Math.max(v.branches, ancien[m]?.branches ?? 0),
      },
    ]),
  )
  const doc = {
    _note:
      'Plancher de couverture par module (% lignes, % branches). Généré par scripts/couverture-cliquet.mjs --relever ; ne se baisse jamais à la main sans décision du PO.',
    modules,
  }
  fs.writeFileSync(PLANCHER, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`Plancher écrit : ${Object.keys(modules).length} modules.`)
  process.exit(0)
}

const plancher = JSON.parse(fs.readFileSync(PLANCHER, 'utf8')).modules
const reculs = []
const hausses = []
for (const [m, v] of Object.entries(actuel)) {
  const p = plancher[m]
  if (!p) continue
  for (const k of ['lignes', 'branches']) {
    if (v[k] < p[k] - TOLERANCE)
      reculs.push(`${m} : ${k} ${p[k]} % → ${v[k]} %`)
    else if (v[k] > p[k] + TOLERANCE)
      hausses.push(`${m} : ${k} ${p[k]} % → ${v[k]} %`)
  }
}
const nouveaux = Object.keys(actuel).filter((m) => !plancher[m])

if (hausses.length || nouveaux.length) {
  console.log(
    `Hausse sur ${hausses.length} mesure(s)${nouveaux.length ? `, ${nouveaux.length} module(s) nouveau(x)` : ''} : relever le plancher avec \`node scripts/couverture-cliquet.mjs --relever\` et le committer.`,
  )
}
if (reculs.length) {
  console.log(`✖ Recul de couverture sur ${reculs.length} mesure(s) :`)
  for (const r of reculs) console.log(`  ${r}`)
  console.log(
    'Ajouter les tests manquants ; baisser le plancher est une décision du PO.',
  )
  process.exit(1)
}
console.log(
  `Couverture : aucun recul sur ${Object.keys(actuel).length} modules.`,
)
