import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { slugify } from '@/lib/slug'
import { useLeafResync } from './use-leaf-resync'
import { idAt, type Entite } from '@/test/harness-hooks'

/**
 * ORACLES de `useLeafResync` (JSDoc du hook) :
 *  O1. RENOMMAGE SOUS URL STABLE : le MÊME segment de feuille devient irrésolu
 *      alors que l'élément existe toujours (par id) → l'URL est réécrite UNE fois,
 *      en `replace`, sur le chemin frais ; le détail ne se referme pas.
 *  O2. GARDE-FOU back/forward : si le segment a CHANGÉ, on ne resynchronise pas —
 *      c'est une navigation vers une autre URL périmée, pas un renommage.
 *  O3. SUPPRESSION : l'élément n'existe plus → aucune réécriture (repli naturel
 *      vers la navigation).
 *  O4. Le timing (`layout`) ne change QUE le moment, jamais le nombre d'appels.
 */

interface Props {
  leafSeg: string | undefined
  items: Entite[]
  layout?: boolean
}

const getItemId = (e: Entite) => e.id

/** Résout la feuille comme le font les explorateurs : segment = nom slugifié. */
function resoudre(items: Entite[], leafSeg: string | undefined): Entite | null {
  if (leafSeg === undefined) return null
  return items.find((i) => slugify(i.nom) === leafSeg) ?? null
}

function monter(initialProps: Props, goToItem: (item: Entite) => void) {
  return renderHook(
    ({ leafSeg, items, layout }: Props) => {
      const openItem = resoudre(items, leafSeg)
      useLeafResync({
        leafSeg,
        openItem,
        items,
        getItemId,
        goToItem: (item) => {
          goToItem(item)
        },
        layout,
      })
      return openItem
    },
    { initialProps },
  )
}

const visite: Entite = { id: idAt(0), nom: 'Visite annuelle' }
const ramonage: Entite = { id: idAt(1), nom: 'Ramonage' }

describe('useLeafResync — renommage de l’élément ouvert (O1)', () => {
  it('réécrit l’URL une seule fois sur le chemin frais', () => {
    const goToItem = vi.fn<(item: Entite) => void>()
    const { rerender } = monter(
      { leafSeg: 'visite-annuelle', items: [visite, ramonage] },
      goToItem,
    )
    expect(goToItem).not.toHaveBeenCalled()

    // Renommage reçu en direct : le segment de l'URL ne résout plus.
    const renomme: Entite = { id: visite.id, nom: 'Visite annuelle Nord' }
    rerender({ leafSeg: 'visite-annuelle', items: [renomme, ramonage] })

    // O1 : on retrouve l'élément par son id et on resynchronise, une fois.
    expect(goToItem).toHaveBeenCalledTimes(1)
    expect(goToItem).toHaveBeenCalledWith(renomme)

    // La route applique la réécriture → plus rien à faire.
    rerender({ leafSeg: 'visite-annuelle-nord', items: [renomme, ramonage] })
    expect(goToItem).toHaveBeenCalledTimes(1)
  })

  it('passe bien `replace: true` (on corrige l’URL, on n’empile pas d’historique)', () => {
    const goToItem = vi.fn<(item: Entite, opts: { replace: boolean }) => void>()
    const renomme: Entite = { id: visite.id, nom: 'Visite semestrielle' }
    const { rerender } = renderHook(
      ({ leafSeg, items }: { leafSeg: string; items: Entite[] }) => {
        useLeafResync({
          leafSeg,
          openItem: resoudre(items, leafSeg),
          items,
          getItemId,
          goToItem,
        })
      },
      { initialProps: { leafSeg: 'visite-annuelle', items: [visite] } },
    )
    rerender({ leafSeg: 'visite-annuelle', items: [renomme] })
    expect(goToItem).toHaveBeenCalledWith(renomme, { replace: true })
  })

  it('se comporte à l’identique en mode layout (O4)', () => {
    const goToItem = vi.fn<(item: Entite) => void>()
    const renomme: Entite = { id: visite.id, nom: 'Visite trimestrielle' }
    const { rerender } = monter(
      { leafSeg: 'visite-annuelle', items: [visite], layout: true },
      goToItem,
    )
    rerender({ leafSeg: 'visite-annuelle', items: [renomme], layout: true })
    expect(goToItem).toHaveBeenCalledTimes(1)
    expect(goToItem).toHaveBeenCalledWith(renomme)
  })
})

describe('useLeafResync — cas où il ne faut PAS resynchroniser', () => {
  it('ignore un segment DIFFÉRENT devenu irrésolu (back/forward) (O2)', () => {
    const goToItem = vi.fn<(item: Entite) => void>()
    const { rerender } = monter(
      { leafSeg: 'visite-annuelle', items: [visite, ramonage] },
      goToItem,
    )

    // L'utilisateur revient sur une URL périmée d'un AUTRE élément : rien de
    // renommé, aucune raison de le téléporter vers l'élément précédent.
    rerender({ leafSeg: 'gamme-supprimee-hier', items: [visite, ramonage] })
    expect(goToItem).not.toHaveBeenCalled()
  })

  it('ne fait rien quand l’élément ouvert a été supprimé (O3)', () => {
    const goToItem = vi.fn<(item: Entite) => void>()
    const { rerender } = monter(
      { leafSeg: 'visite-annuelle', items: [visite, ramonage] },
      goToItem,
    )
    rerender({ leafSeg: 'visite-annuelle', items: [ramonage] })
    expect(goToItem).not.toHaveBeenCalled()
  })

  it('ne fait rien sans feuille ouverte (leafSeg undefined)', () => {
    const goToItem = vi.fn<(item: Entite) => void>()
    const { rerender } = monter(
      { leafSeg: 'visite-annuelle', items: [visite] },
      goToItem,
    )
    rerender({ leafSeg: undefined, items: [{ id: visite.id, nom: 'Autre' }] })
    expect(goToItem).not.toHaveBeenCalled()
  })

  it('ne fait rien sur un deep-link irrésolu jamais ouvert (aucune mémoire)', () => {
    const goToItem = vi.fn<(item: Entite) => void>()
    monter({ leafSeg: 'jamais-vue', items: [visite, ramonage] }, goToItem)
    expect(goToItem).not.toHaveBeenCalled()
  })

  it('ne fait rien tant que l’élément ouvert reste résolu', () => {
    const goToItem = vi.fn<(item: Entite) => void>()
    const { rerender } = monter(
      { leafSeg: 'visite-annuelle', items: [visite] },
      goToItem,
    )
    // Re-rendus successifs sans changement de nom (refetch realtime).
    rerender({ leafSeg: 'visite-annuelle', items: [visite] })
    rerender({ leafSeg: 'visite-annuelle', items: [visite] })
    expect(goToItem).not.toHaveBeenCalled()
  })
})
