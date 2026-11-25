#!/usr/bin/env node
// Branche les hooks versionnés de `.githooks/` (lancé par `npm install` via
// `prepare`). Sans dépôt git (build Vercel, archive), ne fait rien : une
// installation ne doit jamais échouer pour un garde-fou de poste.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const racine = path.resolve(import.meta.dirname, '..')
if (!fs.existsSync(path.join(racine, '.git')) || process.env.CI) process.exit(0)
const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: racine,
})
if (r.status === 0)
  console.log('Hooks git branchés (.githooks : avant commit et avant poussée).')
