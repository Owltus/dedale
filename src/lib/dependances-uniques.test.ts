import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Garde-fou (plan garde-fous permanents, étape 7) : une seule copie installée
 * des bibliothèques qui portent un état global.
 *
 * Incident d'origine (09/2026, « gel UI ») : quatre copies de
 * `@radix-ui/react-dismissable-layer` gardaient chacune leur pile de couches ;
 * `pointer-events: none` restait collé sur le body et l'interface ne répondait
 * plus. Deux copies de React cassent les hooks de la même façon.
 */
const verrou = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'package-lock.json'),
    'utf8',
  ),
) as { packages: Record<string, { version?: string }> }

function versions(nom: string): string[] {
  const vues = new Set<string>()
  for (const [chemin, info] of Object.entries(verrou.packages)) {
    if (chemin.endsWith(`node_modules/${nom}`) && info.version)
      vues.add(info.version)
  }
  return [...vues]
}

const UNIQUES = [
  'react',
  'react-dom',
  '@tanstack/react-query',
  '@tanstack/react-router',
  '@radix-ui/react-dismissable-layer',
  '@radix-ui/react-focus-scope',
  '@radix-ui/react-portal',
  '@radix-ui/react-presence',
  '@radix-ui/react-primitive',
]

describe('une seule version installée', () => {
  it.each(UNIQUES)('%s', (nom) => {
    const v = versions(nom)
    expect(v.length, `${nom} absent du verrou`).toBeGreaterThan(0)
    expect(
      v,
      `${nom} installé en plusieurs versions : npm dedupe, ou aligner la dépendance qui tire l'autre`,
    ).toHaveLength(1)
  })
})
