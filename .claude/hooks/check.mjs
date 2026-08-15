#!/usr/bin/env node
// Hook PostToolUse (Edit|Write|MultiEdit) : après modification d'un fichier
// .ts/.tsx, formate CE fichier avec Prettier puis lance un type-check
// incrémental. En cas d'erreur de types, sort en code 2 pour remonter les
// messages à Claude (non destructif : l'édition a déjà eu lieu).
//
// Le formatage est le garde-fou qui manquait : le type-check seul a laissé
// 94 fichiers sur 377 dériver hors format sans qu'aucun signal ne remonte.
// Il porte sur le SEUL fichier édité (quasi gratuit), jamais sur le projet.
import { spawnSync } from 'node:child_process'

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

let filePath = ''
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path ?? ''
} catch {
  process.exit(0) // entrée illisible : on ne bloque rien
}

// On ne vérifie que le TypeScript.
if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0)

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

// Formatage du fichier édité. Volontairement silencieux et non bloquant :
// un échec de Prettier (fichier syntaxiquement invalide en cours d'écriture)
// ne doit jamais masquer l'erreur de types, qui est le vrai signal.
spawnSync(
  process.execPath,
  ['./node_modules/prettier/bin/prettier.cjs', '--write', filePath],
  { cwd: projectDir, encoding: 'utf8' },
)

const res = spawnSync(
  process.execPath,
  ['./node_modules/typescript/bin/tsc', '-b'],
  { cwd: projectDir, encoding: 'utf8' },
)

if (res.status !== 0) {
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim()
  process.stderr.write(
    `Type-check échoué après édition de ${filePath} :\n${out}\n`,
  )
  process.exit(2)
}

process.exit(0)
