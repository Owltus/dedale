import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import registre from '../../docs/conventions/parcours-critiques.md?raw'

/**
 * Le registre des parcours critiques (`docs/conventions/parcours-critiques.md`)
 * doit rester VRAI : chaque parcours nomme au moins un fichier de test, et
 * chaque fichier cité existe. Un test renommé ou supprimé sans mise à jour du
 * registre fait échouer la suite.
 */
const RACINE = fileURLToPath(new URL('../../', import.meta.url))

interface Parcours {
  nom: string
  fichiers: string[]
}

function lireRegistre(texte: string): Parcours[] {
  const debut = texte.indexOf('<!-- registre-parcours : début')
  const fin = texte.indexOf('<!-- registre-parcours : fin')
  if (debut < 0 || fin < debut) return []
  return texte
    .slice(debut, fin)
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter(
      ([, nom]) => nom !== '' && nom !== 'Parcours' && !/^-+$/.test(nom ?? ''),
    )
    .map(([, nom = '', fichiers = '']) => ({
      nom,
      fichiers: [...fichiers.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? ''),
    }))
}

const parcours = lireRegistre(registre)

describe('registre des parcours critiques', () => {
  it('se lit et couvre les parcours du bilan de santé', () => {
    expect(parcours.map((p) => p.nom)).toEqual(
      expect.arrayContaining([
        'Connexion',
        'Investissements (projets, devis, accords)',
        'Comptes (création, rôle, accès)',
        "Demandes d'intervention",
      ]),
    )
    expect(parcours.length).toBeGreaterThanOrEqual(12)
  })

  it.each(parcours.map((p) => [p.nom, p] as const))(
    '%s : au moins un fichier de test, tous présents',
    (_nom, p) => {
      expect(p.fichiers.length).toBeGreaterThan(0)
      const absents = p.fichiers.filter((f) => !existsSync(RACINE + f))
      expect(absents).toEqual([])
    },
  )

  it('le lecteur détecte un fichier absent et un parcours vide (le test mord)', () => {
    const faux = lireRegistre(
      [
        '<!-- registre-parcours : début -->',
        '| Parcours | Fichiers de tests | Ce qui est prouvé |',
        '| --- | --- | --- |',
        '| Vide | | rien |',
        '| Fantôme | `src/nexiste-pas.test.ts` | rien |',
        '<!-- registre-parcours : fin -->',
      ].join('\n'),
    )
    expect(faux).toEqual([
      { nom: 'Vide', fichiers: [] },
      { nom: 'Fantôme', fichiers: ['src/nexiste-pas.test.ts'] },
    ])
    expect(existsSync(RACINE + 'src/nexiste-pas.test.ts')).toBe(false)
  })
})
