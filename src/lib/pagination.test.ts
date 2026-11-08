import { describe, expect, it } from 'vitest'
import { toutesLesLignes } from './pagination'

/** Faux serveur : renvoie la tranche [debut, fin] d'un tableau, comme `.range()`. */
function serveur(total: number) {
  const donnees = Array.from({ length: total }, (_, i) => i)
  const appels: [number, number][] = []
  const page = (debut: number, fin: number) => {
    appels.push([debut, fin])
    return Promise.resolve({ data: donnees.slice(debut, fin + 1) })
  }
  return { page, appels }
}

describe('toutesLesLignes', () => {
  it('moins d’une page → un seul appel', async () => {
    const { page, appels } = serveur(7)
    expect(await toutesLesLignes(page, 10)).toHaveLength(7)
    expect(appels).toEqual([[0, 9]])
  })

  it('plusieurs pages → toutes les lignes, dans l’ordre, sans doublon', async () => {
    const { page, appels } = serveur(25)
    const r = await toutesLesLignes(page, 10)
    expect(r).toEqual(Array.from({ length: 25 }, (_, i) => i))
    expect(appels).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ])
  })

  it('multiple exact de la taille → une page vide de plus, puis arrêt', async () => {
    const { page, appels } = serveur(20)
    expect(await toutesLesLignes(page, 10)).toHaveLength(20)
    expect(appels).toHaveLength(3)
  })

  it('data null (aucun résultat) → tableau vide', async () => {
    const r = await toutesLesLignes<number>(() =>
      Promise.resolve({ data: null }),
    )
    expect(r).toEqual([])
  })

  // Le cas réel : 1 001 OT avec le plafond Supabase par défaut — aucun ne manque.
  it('au-delà du plafond par défaut (1 000) → rien ne manque', async () => {
    const { page } = serveur(1001)
    expect(await toutesLesLignes(page)).toHaveLength(1001)
  })
})
