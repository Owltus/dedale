import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { cleanup, renderHook } from '@testing-library/react'
import { segOfUnique } from '@/lib/slug'
import { useTreeDrill, type TreeNode } from './use-tree-drill'
import {
  arbreArb,
  chaineReelle,
  idAt,
  pasArb,
  segDeCategorie,
  segsDeChaine,
  segsDepuisPas,
  type Categorie,
} from '@/test/harness-hooks'

/**
 * ORACLES de `useTreeDrill` (JSDoc du hook + patron de navigation Bibliothèque) :
 *  O1. TOLÉRANCE : un segment introuvable TRONQUE le chemin à son préfixe valide.
 *      Donc `path` est TOUJOURS un préfixe (au sens des segments) de `catSegs`.
 *  O2. CHAÎNE COHÉRENTE : `path[0]` est une racine et `path[i].parent_id ===
 *      path[i-1].id` — on ne peut pas « sauter » un palier.
 *  O3. FEUILLE : `leafSeg` est le PREMIER segment non consommé par le chemin.
 *  O4. STABILITÉ : le hook ne navigue JAMAIS de lui-même (aucune boucle de
 *      navigation) et se stabilise en un seul rendu.
 *  O5. SYMÉTRIE : les segments produits par `goTo` se relisent exactement vers la
 *      même chaîne (génération et résolution utilisent `segOfUnique` sur les
 *      MÊMES frères).
 *
 * Le hook prend `navigateTo` en paramètre : aucun routeur TanStack n'est monté,
 * on espionne simplement les navigations.
 */

type NavSpy = ReturnType<typeof faireNavSpy>

function faireNavSpy() {
  return vi.fn<
    (
      segs: string[],
      leaf: string | undefined,
      opts: { replace: boolean },
    ) => void
  >()
}

function monter<T extends TreeNode>(cats: T[], segs: string[], nav: NavSpy) {
  return renderHook(() => useTreeDrill(cats, segs, nav))
}

describe('useTreeDrill — propriétés du chemin résolu', () => {
  it('le chemin résolu est TOUJOURS un préfixe du chemin demandé (O1/O2/O3)', () => {
    fc.assert(
      fc.property(arbreArb, fc.array(pasArb, { maxLength: 6 }), (cats, pas) => {
        const segs = segsDepuisPas(cats, pas)
        const nav = faireNavSpy()
        let rendus = 0

        const { result } = renderHook(() => {
          rendus += 1
          return useTreeDrill(cats, segs, nav)
        })
        const drill = result.current

        // O1 : jamais plus long que ce qui est demandé.
        expect(drill.path.length).toBeLessThanOrEqual(segs.length)
        // O1 : chaque palier retenu se relit EXACTEMENT sur le segment demandé.
        drill.path.forEach((cat, i) => {
          expect(segDeCategorie(cat, cats)).toBe(segs[i])
        })
        // O2 : chaîne parent → enfant sans trou.
        drill.path.forEach((cat, i) => {
          expect(cat.parent_id).toBe(i === 0 ? null : drill.path[i - 1]?.id)
        })
        // O3 : la feuille est le premier segment non consommé.
        expect(drill.leafSeg).toBe(segs[drill.path.length])
        // O4 : ni navigation spontanée, ni rendu supplémentaire.
        expect(nav).not.toHaveBeenCalled()
        expect(rendus).toBe(1)
        cleanup()
      }),
      { numRuns: 200 },
    )
  })

  it('expose les enfants directs du palier courant, racines à la racine (O2)', () => {
    fc.assert(
      fc.property(
        arbreArb,
        fc.array(fc.nat(), { maxLength: 4 }),
        (cats, ks) => {
          const chaine = chaineReelle(cats, ks)
          const segs = segsDeChaine(chaine, cats)
          const nav = faireNavSpy()
          const { result } = monter(cats, segs, nav)

          const courant = result.current.current
          const attendu = cats.filter(
            (c) => c.parent_id === (courant?.id ?? null),
          )
          expect(result.current.children).toEqual(attendu)
          expect(result.current.depth).toBe(result.current.path.length)
          cleanup()
        },
      ),
      { numRuns: 150 },
    )
  })

  it('un chemin entièrement valide est résolu en ENTIER (O1)', () => {
    fc.assert(
      fc.property(
        arbreArb,
        fc.array(fc.nat(), { maxLength: 4 }),
        (cats, ks) => {
          const chaine = chaineReelle(cats, ks)
          const segs = segsDeChaine(chaine, cats)
          const { result } = monter(cats, segs, faireNavSpy())

          // O1 : aucune troncature quand tous les segments existent.
          expect(result.current.path).toEqual(chaine)
          expect(result.current.current).toBe(chaine.at(-1) ?? null)
          expect(result.current.leafSeg).toBeUndefined()
          cleanup()
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('useTreeDrill — symétrie génération / résolution (O5)', () => {
  it('les segments produits par goTo se relisent vers la MÊME chaîne', () => {
    fc.assert(
      fc.property(
        arbreArb,
        fc.array(fc.nat(), { maxLength: 4 }),
        (cats, ks) => {
          const chaine = chaineReelle(cats, ks)
          const nav = faireNavSpy()
          const { result } = monter(cats, [], nav)

          result.current.goTo(chaine)
          const appel = nav.mock.calls[0]
          expect(appel).toBeDefined()
          const [segsProduits, feuille, opts] = appel ?? [[], undefined, null]
          // `goTo` = PUSH (pas de replace) et pas de feuille.
          expect(feuille).toBeUndefined()
          expect(opts).toEqual({ replace: false })
          cleanup()

          // O5 : ces segments, remis dans l'URL, redonnent exactement la chaîne.
          const { result: relu } = monter(cats, segsProduits, faireNavSpy())
          expect(relu.current.path).toEqual(chaine)
          cleanup()
        },
      ),
      { numRuns: 200 },
    )
  })

  it('goToLeaf ajoute la feuille et respecte l’option replace (O3/O5)', () => {
    const cats: Categorie[] = [
      { id: idAt(0), nom: 'CVC', parent_id: null },
      { id: idAt(1), nom: 'Chaudières', parent_id: idAt(0) },
    ]
    const nav = faireNavSpy()
    const { result } = monter(cats, [], nav)

    result.current.goToLeaf(cats, 'visite-annuelle', { replace: true })
    expect(nav).toHaveBeenCalledWith(['cvc', 'chaudieres'], 'visite-annuelle', {
      replace: true,
    })

    // Défaut documenté : PUSH.
    result.current.goToLeaf(cats, 'visite-annuelle')
    expect(nav).toHaveBeenLastCalledWith(
      ['cvc', 'chaudieres'],
      'visite-annuelle',
      { replace: false },
    )
  })
})

describe('useTreeDrill — tolérance aux chemins cassés (O1/O4)', () => {
  const cats: Categorie[] = [
    { id: idAt(0), nom: 'CVC', parent_id: null },
    { id: idAt(1), nom: 'Chaudières', parent_id: idAt(0) },
    { id: idAt(2), nom: 'Électricité', parent_id: null },
  ]

  it('tronque au PREMIER segment invalide et expose le reste en feuille', () => {
    const nav = faireNavSpy()
    const { result } = monter(cats, ['cvc', 'inexistant', 'chaudieres'], nav)
    // O1 : on remonte au dernier palier résolu…
    expect(result.current.path.map((c) => c.nom)).toEqual(['CVC'])
    // O3 : …et le segment fautif devient la feuille à résoudre par l'appelant.
    expect(result.current.leafSeg).toBe('inexistant')
    // O4 : aucune réécriture d'URL automatique (« drill tolérant », pas correcteur).
    expect(nav).not.toHaveBeenCalled()
  })

  it('refuse un segment valide mais posé au MAUVAIS palier (désordre)', () => {
    // « chaudieres » n'est pas une racine : la résolution s'arrête tout de suite.
    const { result } = monter(cats, ['chaudieres', 'cvc'], faireNavSpy())
    expect(result.current.path).toEqual([])
    expect(result.current.current).toBeNull()
    expect(result.current.leafSeg).toBe('chaudieres')
  })

  it('encaisse une suite de segments très longue sans boucler', () => {
    const nav = faireNavSpy()
    const segs = Array.from({ length: 500 }, (_, i) => `segment-${String(i)}`)
    let rendus = 0
    const { result } = renderHook(() => {
      rendus += 1
      return useTreeDrill(cats, segs, nav)
    })
    expect(result.current.path).toEqual([])
    expect(rendus).toBe(1)
    expect(nav).not.toHaveBeenCalled()
  })

  it('résout une catégorie au nom non slugifiable par son id (repli segOfUnique)', () => {
    const exotiques: Categorie[] = [
      { id: idAt(5), nom: '###', parent_id: null },
      { id: idAt(6), nom: 'Enfant', parent_id: idAt(5) },
    ]
    const { result } = monter(exotiques, [idAt(5), 'enfant'], faireNavSpy())
    expect(result.current.path.map((c) => c.id)).toEqual([idAt(5), idAt(6)])
  })

  it('désambiguïse deux racines homonymes (collision de slug)', () => {
    const homonymes: Categorie[] = [
      { id: idAt(0), nom: 'Électricité', parent_id: null },
      { id: idAt(1), nom: 'Electricite', parent_id: null },
    ]
    const segA = segOfUnique(homonymes[0]!, homonymes)
    const segB = segOfUnique(homonymes[1]!, homonymes)
    expect(segA).not.toBe(segB)

    const { result: a } = monter(homonymes, [segA], faireNavSpy())
    expect(a.current.current).toBe(homonymes[0])
    cleanup()
    const { result: b } = monter(homonymes, [segB], faireNavSpy())
    expect(b.current.current).toBe(homonymes[1])
  })

  it('remonte au parent quand la catégorie courante disparaît (realtime)', () => {
    const nav = faireNavSpy()
    const { result, rerender } = renderHook(
      ({ liste }: { liste: Categorie[] }) =>
        useTreeDrill(liste, ['cvc', 'chaudieres'], nav),
      { initialProps: { liste: cats } },
    )
    expect(result.current.depth).toBe(2)

    // « Chaudières » est supprimée ailleurs → le chemin se tronque tout seul.
    rerender({ liste: cats.filter((c) => c.id !== idAt(1)) })
    expect(result.current.path.map((c) => c.nom)).toEqual(['CVC'])
    expect(result.current.leafSeg).toBe('chaudieres')
    expect(nav).not.toHaveBeenCalled()
  })
})
