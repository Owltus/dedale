import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Garde-fou (plan garde-fous permanents, étape 8) : chaque variable
 * d'environnement lue par le code figure dans le bon fichier d'exemple, et
 * aucun exemple ne décrit une variable que plus personne ne lit.
 *
 * Front : `import.meta.env.VITE_*` ↔ `.env.example`.
 * Edge Functions : `Deno.env.get('…')` ↔ `supabase/functions/.env.example`.
 * Le bilan de santé du 25/11/2026 avait trouvé deux secrets Dmbook documentés
 * seulement dans un commentaire de code.
 */
const racine = join(import.meta.dirname, '..', '..')

function fichiers(dossier: string, extensions: RegExp): string[] {
  const out: string[] = []
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory())
      out.push(...fichiers(chemin, extensions))
    else if (extensions.test(nom) && !/\.test\.tsx?$/.test(nom))
      out.push(chemin)
  }
  return out
}

function lues(dossier: string, motif: RegExp): Map<string, string> {
  const vues = new Map<string, string>()
  for (const f of fichiers(join(racine, dossier), /\.tsx?$/)) {
    for (const m of readFileSync(f, 'utf8').matchAll(motif)) {
      const nom = m[1]
      if (nom && !vues.has(nom)) vues.set(nom, relative(racine, f))
    }
  }
  return vues
}

function exemple(chemin: string): Set<string> {
  const texte = readFileSync(join(racine, chemin), 'utf8')
  return new Set(
    [...texte.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? ''),
  )
}

describe.each([
  {
    nom: 'front',
    dossier: 'src',
    motif: /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g,
    fichierExemple: '.env.example',
  },
  {
    nom: 'Edge Functions',
    dossier: 'supabase/functions',
    motif: /Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g,
    fichierExemple: 'supabase/functions/.env.example',
  },
])('variables d’environnement — $nom', ({ dossier, motif, fichierExemple }) => {
  const code = lues(dossier, motif)
  const doc = exemple(fichierExemple)

  it('le code lit au moins une variable (garde anti-vacuité)', () => {
    expect(code.size).toBeGreaterThan(0)
  })

  it(`chaque variable lue figure dans ${fichierExemple}`, () => {
    const manquantes = [...code]
      .filter(([nom]) => !doc.has(nom))
      .map(([nom, f]) => `${nom} (lue dans ${f})`)
    expect(manquantes, `à documenter dans ${fichierExemple}`).toEqual([])
  })

  it(`${fichierExemple} ne décrit aucune variable morte`, () => {
    const mortes = [...doc].filter((nom) => !code.has(nom))
    expect(mortes, 'plus lues par le code : à retirer de l’exemple').toEqual([])
  })
})
