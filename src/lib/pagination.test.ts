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
    // 1re page seule, puis un lot de 4 pages en parallèle (dont 2 vides).
    expect(appels).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
      [30, 39],
      [40, 49],
    ])
  })

  it('au-delà de la 1re page, les pages du lot partent ENSEMBLE', async () => {
    const enCours: number[] = []
    let maxSimultanees = 0
    const page = async (debut: number, fin: number) => {
      enCours.push(debut)
      maxSimultanees = Math.max(maxSimultanees, enCours.length)
      await new Promise((r) => setTimeout(r, 1))
      enCours.splice(enCours.indexOf(debut), 1)
      return {
        data: Array.from(
          { length: Math.max(0, Math.min(fin, 44) - debut + 1) },
          (_, i) => debut + i,
        ),
      }
    }
    const r = await toutesLesLignes(page, 10)
    expect(r).toEqual(Array.from({ length: 45 }, (_, i) => i))
    expect(maxSimultanees).toBe(4)
  })

  it('plus d’un lot → enchaîne les lots jusqu’à la page incomplète', async () => {
    const { page, appels } = serveur(65)
    expect(await toutesLesLignes(page, 10)).toEqual(
      Array.from({ length: 65 }, (_, i) => i),
    )
    // 1 + 4 + 4 appels : le 2e lot contient la page incomplète [60-69].
    expect(appels).toHaveLength(9)
  })

  it('multiple exact de la taille → s’arrête au lot qui contient la page vide', async () => {
    const { page, appels } = serveur(20)
    expect(await toutesLesLignes(page, 10)).toHaveLength(20)
    expect(appels).toHaveLength(5)
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
