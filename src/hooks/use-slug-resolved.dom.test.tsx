import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { cleanup, renderHook } from '@testing-library/react'
import { segOfUnique } from '@/lib/slug'
import { useSlugResolved } from './use-slug-resolved'
import { entitesArb, idAt, type Entite } from '@/test/harness-hooks'

/**
 * ORACLES de `useSlugResolved` (extraits de sa JSDoc et du patron « liste +
 * détail par slug ») :
 *  O1. ALLER-RETOUR D'IDENTITÉ : le segment produit pour une entité, résolu avec
 *      LA MÊME fratrie, redonne EXACTEMENT cette entité (symétrie `segOfUnique`).
 *  O2. Un slug non résolvable donne l'état « introuvable » (`null`), jamais une
 *      exception : la route affiche alors son `EmptyState`.
 *  O3. RENOMMAGE de l'entité ouverte : elle reste ouverte (repli par id mémorisé)
 *      et l'URL est réécrite UNE SEULE FOIS sur le slug frais.
 *  O4. SUPPRESSION : l'id mémorisé n'est plus dans la liste → `null`, et AUCUNE
 *      réécriture d'URL (on n'a nulle part où aller).
 *  O5. CHANGEMENT DE SITE ACTIF (la liste est remplacée) : jamais une entité de
 *      l'ancienne liste — ce serait une fuite inter-sites à l'écran.
 *
 * Aucun routeur n'est monté : le hook reçoit `renavigate` en paramètre, on
 * l'espionne pour COMPTER les navigations.
 */

/** Fabrique un `segOf` STABLE (identité constante) lisant une fratrie mutable. */
function segOfStable(ref: { current: Entite[] }): (e: Entite) => string {
  return (e: Entite) => segOfUnique(e, ref.current)
}

describe('useSlugResolved — aller-retour d’identité (O1)', () => {
  it('résout le segment généré vers EXACTEMENT la même entité, pour toute fratrie', () => {
    fc.assert(
      fc.property(entitesArb, fc.nat(), (entites, k) => {
        const cible = entites[k % entites.length]
        if (cible === undefined) return
        const segOf = (e: Entite) => segOfUnique(e, entites)
        const renavigate = vi.fn<(s: string) => void>()

        const { result } = renderHook(() =>
          useSlugResolved(entites, segOf(cible), segOf, renavigate),
        )

        // O1 : identité exacte (même référence), et rien à resynchroniser.
        expect(result.current).toBe(cible)
        expect(renavigate).not.toHaveBeenCalled()
        cleanup()
      }),
      { numRuns: 300 },
    )
  })

  it('résout TOUTES les entités d’une même fratrie sans confusion (O1)', () => {
    fc.assert(
      fc.property(entitesArb, (entites) => {
        const segOf = (e: Entite) => segOfUnique(e, entites)
        for (const attendue of entites) {
          const { result } = renderHook(() =>
            useSlugResolved(entites, segOf(attendue), segOf, vi.fn()),
          )
          expect(result.current).toBe(attendue)
          cleanup()
        }
      }),
      { numRuns: 100 },
    )
  })
})

describe('useSlugResolved — slug non résolvable (O2)', () => {
  it('renvoie null sans lever, pour un slug arbitraire absent de la fratrie', () => {
    fc.assert(
      fc.property(entitesArb, fc.string(), (entites, slug) => {
        const segOf = (e: Entite) => segOfUnique(e, entites)
        // On ne garde que les slugs réellement absents (sinon O1 s'applique).
        fc.pre(!entites.some((e) => segOf(e) === slug))

        const renavigate = vi.fn<(s: string) => void>()
        const { result } = renderHook(() =>
          useSlugResolved(entites, slug, segOf, renavigate),
        )

        // O2 : état « introuvable », et aucune navigation (rien à réécrire).
        expect(result.current).toBeNull()
        expect(renavigate).not.toHaveBeenCalled()
        cleanup()
      }),
      { numRuns: 300 },
    )
  })

  it('encaisse les slugs extrêmes (vide, très long, caractères spéciaux) (O2)', () => {
    const entites: Entite[] = [{ id: idAt(0), nom: 'Toiture' }]
    const segOf = (e: Entite) => segOfUnique(e, entites)
    const extremes = [
      '',
      ' ',
      'x'.repeat(10_000),
      '../../etc/passwd',
      '%00',
      '<script>alert(1)</script>',
      'toiture/',
      '🙂',
      '~',
    ]
    for (const slug of extremes) {
      const { result } = renderHook(() =>
        useSlugResolved(entites, slug, segOf, vi.fn()),
      )
      // O2 : aucun de ces slugs n'est le segment de « Toiture » → introuvable.
      expect(result.current).toBeNull()
      cleanup()
    }
  })
})

describe('useSlugResolved — renommage en direct (O3)', () => {
  it('garde l’entité ouverte et réécrit l’URL UNE SEULE FOIS', () => {
    const a: Entite = { id: idAt(0), nom: 'Toiture' }
    const b: Entite = { id: idAt(1), nom: 'Façade' }
    const fratrie = { current: [a, b] }
    const segOf = segOfStable(fratrie)
    const renavigate = vi.fn<(s: string) => void>()
    let rendus = 0

    const { result, rerender } = renderHook(
      ({ items, slug }: { items: Entite[]; slug: string }) => {
        rendus += 1
        return useSlugResolved(items, slug, segOf, renavigate)
      },
      { initialProps: { items: fratrie.current, slug: 'toiture' } },
    )
    expect(result.current).toBe(a)

    // L'entité ouverte est renommée (édition ou réception realtime).
    const aRenomme: Entite = { id: a.id, nom: 'Toiture Nord' }
    fratrie.current = [aRenomme, b]
    rendus = 0
    rerender({ items: fratrie.current, slug: 'toiture' })

    // O3 : toujours ouverte (repli par id) et URL réécrite sur le slug frais.
    expect(result.current).toBe(aRenomme)
    expect(renavigate).toHaveBeenCalledTimes(1)
    expect(renavigate).toHaveBeenCalledWith('toiture-nord')
    // O3 : un ajustement d'état pendant le rendu coûte AU PLUS une ré-exécution
    // immédiate ; aucun effet ne doit en provoquer d'autres (pas de boucle).
    expect(rendus).toBeLessThanOrEqual(2)

    // La route applique la réécriture : le slug frais résout directement.
    rerender({ items: fratrie.current, slug: 'toiture-nord' })
    expect(result.current).toBe(aRenomme)
    expect(renavigate).toHaveBeenCalledTimes(1)
  })

  it('ne boucle pas quand le renommage vide le slug (nom sans [a-z0-9] → repli id)', () => {
    const a: Entite = { id: idAt(0), nom: 'Toiture' }
    const fratrie = { current: [a] }
    const segOf = segOfStable(fratrie)
    const renavigate = vi.fn<(s: string) => void>()

    const { result, rerender } = renderHook(
      ({ items, slug }: { items: Entite[]; slug: string }) =>
        useSlugResolved(items, slug, segOf, renavigate),
      { initialProps: { items: fratrie.current, slug: 'toiture' } },
    )

    const aRenomme: Entite = { id: a.id, nom: '###' }
    fratrie.current = [aRenomme]
    rerender({ items: fratrie.current, slug: 'toiture' })

    // O3 + contrat de `segOfUnique` : slug vide → l'id fait office de segment.
    expect(result.current).toBe(aRenomme)
    expect(renavigate).toHaveBeenCalledTimes(1)
    expect(renavigate).toHaveBeenCalledWith(a.id)
  })

  // BUG CANDIDAT Martin : attendu = une réécriture d'URL est un ÉVÉNEMENT (le slug
  // vient de devenir périmé), pas un effet de chaque rendu ; observé = l'effet
  // dépend de `segOf`/`renavigate`, que TOUS les appelants réels recréent à chaque
  // rendu (cf. `SlugDetailRoute` + les `onSlugChange` inline des routes), donc un
  // simple re-rendu (refetch realtime) relance une navigation `replace`.
  it.fails(
    'ne rejoue PAS la navigation à chaque re-rendu quand les callbacks ne sont pas mémoïsés',
    () => {
      const a: Entite = { id: idAt(0), nom: 'Toiture' }
      const items = [a]
      const renomme = [{ id: a.id, nom: 'Toiture Nord' }]
      const renavigate = vi.fn<(s: string) => void>()

      const { rerender } = renderHook(
        ({ liste, slug }: { liste: Entite[]; slug: string }) =>
          // Callbacks recréés à chaque rendu, comme dans `SlugDetailRoute`.
          useSlugResolved(
            liste,
            slug,
            (e) => segOfUnique(e, liste),
            (s) => {
              renavigate(s)
            },
          ),
        { initialProps: { liste: items, slug: 'toiture' } },
      )

      rerender({ liste: renomme, slug: 'toiture' })
      expect(renavigate).toHaveBeenCalledTimes(1)
      // Re-rendu sans changement d'URL (refetch) → la navigation ne doit pas être rejouée.
      rerender({ liste: [...renomme], slug: 'toiture' })
      expect(renavigate).toHaveBeenCalledTimes(1)
    },
  )
})

describe('useSlugResolved — entité supprimée (O4)', () => {
  it('renvoie null et ne réécrit PAS l’URL', () => {
    const a: Entite = { id: idAt(0), nom: 'Toiture' }
    const b: Entite = { id: idAt(1), nom: 'Façade' }
    const fratrie = { current: [a, b] }
    const segOf = segOfStable(fratrie)
    const renavigate = vi.fn<(s: string) => void>()

    const { result, rerender } = renderHook(
      ({ items, slug }: { items: Entite[]; slug: string }) =>
        useSlugResolved(items, slug, segOf, renavigate),
      { initialProps: { items: fratrie.current, slug: 'toiture' } },
    )
    expect(result.current).toBe(a)

    fratrie.current = [b] // « Toiture » supprimée (hard-delete)
    rerender({ items: fratrie.current, slug: 'toiture' })

    // O4 : plus rien à ouvrir → écran « introuvable », sans navigation parasite.
    expect(result.current).toBeNull()
    expect(renavigate).not.toHaveBeenCalled()
  })
})

describe('useSlugResolved — changement de site actif (O5)', () => {
  it('ne renvoie JAMAIS une entité de l’ancienne liste', () => {
    const siteA: Entite[] = [
      { id: idAt(0), nom: 'Toiture' },
      { id: idAt(1), nom: 'Façade' },
    ]
    const siteB: Entite[] = [
      { id: idAt(8), nom: 'Chaufferie' },
      { id: idAt(9), nom: 'Ascenseur' },
    ]
    const fratrie = { current: siteA }
    const segOf = segOfStable(fratrie)
    const renavigate = vi.fn<(s: string) => void>()

    const { result, rerender } = renderHook(
      ({ items, slug }: { items: Entite[]; slug: string }) =>
        useSlugResolved(items, slug, segOf, renavigate),
      { initialProps: { items: fratrie.current, slug: 'toiture' } },
    )
    expect(result.current).toBe(siteA[0])

    fratrie.current = siteB
    rerender({ items: siteB, slug: 'toiture' })

    // O5 : aucune entité du site A ne doit survivre au changement de périmètre.
    expect(result.current).toBeNull()
    expect(siteA).not.toContain(result.current)
    expect(renavigate).not.toHaveBeenCalled()
  })

  it('résout la bonne entité quand le nouveau site porte le MÊME slug (O5)', () => {
    const toitureA: Entite = { id: idAt(0), nom: 'Toiture' }
    const toitureB: Entite = { id: idAt(9), nom: 'Toiture' }
    const fratrie = { current: [toitureA] }
    const segOf = segOfStable(fratrie)

    const { result, rerender } = renderHook(
      ({ items, slug }: { items: Entite[]; slug: string }) =>
        useSlugResolved(items, slug, segOf, vi.fn()),
      { initialProps: { items: fratrie.current, slug: 'toiture' } },
    )
    expect(result.current).toBe(toitureA)

    fratrie.current = [toitureB]
    rerender({ items: fratrie.current, slug: 'toiture' })

    // O5 : l'homonyme du NOUVEAU site, jamais l'objet mémorisé de l'ancien.
    expect(result.current).toBe(toitureB)
  })
})

describe('useSlugResolved — pièges de résolution', () => {
  // BUG CANDIDAT Martin : attendu = une navigation vers un AUTRE slug invalide
  // (deep-link, back/forward) donne l'écran « introuvable » ; observé = le repli
  // par id mémorisé s'applique à n'importe quel slug irrésolu, donc le hook rouvre
  // l'entité précédente et RÉÉCRIT l'URL vers elle — l'utilisateur ne peut plus
  // atteindre l'état « introuvable ». `useLeafResync` porte justement le garde-fou
  // manquant ici : « on ne re-synchronise que le MÊME segment devenu irrésolu ».
  it.fails(
    'renvoie null quand on navigue vers un AUTRE slug invalide après une résolution',
    () => {
      const a: Entite = { id: idAt(0), nom: 'Toiture' }
      const b: Entite = { id: idAt(1), nom: 'Façade' }
      const fratrie = { current: [a, b] }
      const segOf = segOfStable(fratrie)
      const renavigate = vi.fn<(s: string) => void>()

      const { result, rerender } = renderHook(
        ({ items, slug }: { items: Entite[]; slug: string }) =>
          useSlugResolved(items, slug, segOf, renavigate),
        { initialProps: { items: fratrie.current, slug: 'toiture' } },
      )
      expect(result.current).toBe(a)

      // Aucune entité n'a changé : c'est l'URL qui pointe ailleurs, dans le vide.
      rerender({ items: fratrie.current, slug: 'entite-supprimee-hier' })

      expect(result.current).toBeNull()
      expect(renavigate).not.toHaveBeenCalled()
    },
  )

  // BUG CANDIDAT Martin : attendu = « les segments d'un même ensemble de frères
  // sont tous distincts » (oracle déjà posé dans src/lib/slug.test.ts) ; observé =
  // deux homonymes dont les ids partagent leurs 8 PREMIERS caractères reçoivent le
  // MÊME segment `~<id court>`, et la résolution (`find`) renvoie toujours le 1er
  // → le 2e devient injoignable. Probabilité réelle faible (uuid v4) mais la
  // garantie d'unicité annoncée est fausse.
  it.fails(
    'résout le bon frère quand deux ids partagent leur préfixe court',
    () => {
      const a: Entite = {
        id: 'abcdef01-1111-2222-3333-444444444444',
        nom: 'Pompe',
      }
      const b: Entite = {
        id: 'abcdef01-9999-8888-7777-666666666666',
        nom: 'Pompe',
      }
      const fratrie = [a, b]
      const segOf = (e: Entite) => segOfUnique(e, fratrie)

      const { result } = renderHook(() =>
        useSlugResolved(fratrie, segOf(b), segOf, vi.fn()),
      )
      // O1 : le segment de `b` doit résoudre `b`.
      expect(result.current).toBe(b)
    },
  )

  it('reste sur null (sans navigation) tant que la liste est vide (chargement)', () => {
    const renavigate = vi.fn<(s: string) => void>()
    const segOf = (e: Entite) => segOfUnique(e, [e])
    const a: Entite = { id: idAt(0), nom: 'Toiture' }

    const { result, rerender } = renderHook(
      ({ items, slug }: { items: Entite[]; slug: string }) =>
        useSlugResolved(items, slug, segOf, renavigate),
      { initialProps: { items: [] as Entite[], slug: 'toiture' } },
    )
    // O2 : pendant le chargement (`items = data ?? []`), pas d'entité, pas de navigation.
    expect(result.current).toBeNull()
    expect(renavigate).not.toHaveBeenCalled()

    // Les données arrivent → l'entité s'ouvre sans réécriture d'URL (O1).
    rerender({ items: [a], slug: 'toiture' })
    expect(result.current).toBe(a)
    expect(renavigate).not.toHaveBeenCalled()
  })
})
