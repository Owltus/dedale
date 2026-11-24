import { describe, expect, it } from 'vitest'
import { segOfUnique, slugify } from './slug'

/** Version d'AVANT (24/11/2026), recopiée telle quelle : l'oracle du résultat. */
function segOfUniqueReference(
  obj: { nom: string; id: string },
  siblings: { nom: string; id: string }[],
): string {
  const s = slugify(obj.nom)
  if (!s) return obj.id
  const collision = siblings.some(
    (x) => x.id !== obj.id && slugify(x.nom) === s,
  )
  return collision ? `${s}~${obj.id.slice(0, 8)}` : s
}

const NOMS = [
  'Retouche peinture',
  'Retouche Peinture',
  'Rétouche peinture',
  'Fuite',
  'fuite',
  '###',
  '',
  '① ② ③',
  'Chambre 214 — lavabo',
  'Électricité',
  'Electricite',
  '  Club  ',
]

/** Générateur déterministe (pas de Math.random : test reproductible). */
function suite(graine: number) {
  let x = graine
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

function freres(n: number, graine: number) {
  const r = suite(graine)
  return Array.from({ length: n }, (_, i) => ({
    id: `${String(i).padStart(8, '0')}-${Math.floor(r() * 1e9).toString(16)}`,
    nom:
      NOMS[Math.floor(r() * NOMS.length)]! +
      (r() < 0.5 ? '' : ` ${String(Math.floor(r() * 30))}`),
  }))
}

describe('segOfUnique — même résultat qu’avant, en temps linéaire', () => {
  it('donne exactement les segments de la version d’origine (2 000 frères variés)', () => {
    const sibs = freres(2000, 42)
    for (const x of sibs) {
      expect(segOfUnique(x, sibs)).toBe(segOfUniqueReference(x, sibs))
    }
  })

  it('objet absent de ses frères (création), doublons d’id, liste vide', () => {
    const sibs = freres(50, 7)
    const nouveau = { id: 'zzzzzzzz-nouveau', nom: sibs[0]!.nom }
    expect(segOfUnique(nouveau, sibs)).toBe(segOfUniqueReference(nouveau, sibs))
    const doublons = [sibs[0]!, sibs[0]!, ...sibs]
    for (const x of doublons)
      expect(segOfUnique(x, doublons)).toBe(segOfUniqueReference(x, doublons))
    expect(segOfUnique(nouveau, [])).toBe(segOfUniqueReference(nouveau, []))
  })

  it('tableau modifié sur place (longueur changée) → réindexé', () => {
    const sibs = [{ id: 'aaaaaaaa-1', nom: 'Fuite' }]
    expect(segOfUnique(sibs[0]!, sibs)).toBe('fuite')
    sibs.push({ id: 'bbbbbbbb-2', nom: 'fuite' })
    expect(segOfUnique(sibs[0]!, sibs)).toBe('fuite~aaaaaaaa')
  })

  // Garde-fou : la boucle « un segment par ligne » sur 5 000 lignes prenait
  // ~20 s ; elle doit rester instantanée.
  it('5 000 frères, un segment par ligne : moins de 500 ms', () => {
    const sibs = freres(5000, 3)
    const t0 = performance.now()
    for (const x of sibs) segOfUnique(x, sibs)
    expect(performance.now() - t0).toBeLessThan(500)
  })
})
