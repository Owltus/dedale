import { describe, expect, it, vi } from 'vitest'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import {
  NON_CLASSE_ID,
  useCatalogueDrill,
  type CatalogueDrillCat,
} from './use-catalogue-drill'
import { useTreeDrill, type TreeDrill, type TreeNode } from './use-tree-drill'
import { idAt } from '@/test/harness-hooks'

/**
 * ORACLES de `useCatalogueDrill` (JSDoc + ADR « catalogue commun = réserve ») :
 *  O1. ALLER-RETOUR : `goToItem(x)` produit une URL qui, relue, rouvre EXACTEMENT
 *      `x` (mêmes frères des deux côtés → symétrie `segOfUnique`).
 *  O2. RENOMMAGE de l'élément ouvert : il reste ouvert, l'URL est réécrite UNE
 *      SEULE FOIS en `replace` (`useLeafResync`).
 *  O3. SUPPRESSION de l'élément ouvert : plus rien d'ouvert, AUCUNE navigation.
 *  O4. Segment de feuille inconnu : état « rien d'ouvert », sans navigation ni
 *      boucle de réécriture.
 *  O5. Bac « Non classé » : présent SI et SEULEMENT SI des orphelins existent ;
 *      un orphelin est joignable par URL via ce bac.
 *
 * Le routeur TanStack n'est pas monté : un FAUX routeur local rejoue la boucle
 * réelle (naviguer ⇒ l'URL change ⇒ le drill se re-résout). Une réécriture en
 * boucle ferait donc échouer le test (« Maximum update depth exceeded ») au lieu
 * de passer inaperçue.
 */

type NavigateTo = (
  segs: string[],
  leaf: string | undefined,
  opts: { replace: boolean },
) => void

interface Routeur {
  segs: string[]
  navigateTo: NavigateTo
}

const RouteurCtx = createContext<Routeur>({
  segs: [],
  navigateTo: () => undefined,
})

/** Adaptateur de route de test : même rôle que `useGammesDrill`. */
function useDrillTest<T extends TreeNode>(cats: T[]): TreeDrill<T> {
  const { segs, navigateTo } = useContext(RouteurCtx)
  return useTreeDrill(cats, segs, navigateTo)
}

function FauxRouteur({
  segs0,
  onNavigate,
  children,
}: {
  segs0: string[]
  onNavigate: NavigateTo
  children: ReactNode
}) {
  const [segs, setSegs] = useState(segs0)
  const navigateTo = useCallback<NavigateTo>(
    (catSegs, leaf, opts) => {
      onNavigate(catSegs, leaf, opts)
      setSegs([...catSegs, ...(leaf !== undefined ? [leaf] : [])])
    },
    [onNavigate],
  )
  const valeur = useMemo(() => ({ segs, navigateTo }), [segs, navigateTo])
  return <RouteurCtx.Provider value={valeur}>{children}</RouteurCtx.Provider>
}

interface Gamme {
  id: string
  nom: string
  categorie_id: string | null
}

const getItemId = (g: Gamme) => g.id
const getItemNom = (g: Gamme) => g.nom
const getCategorieId = (g: Gamme) => g.categorie_id
const makeVirtual = (): CatalogueDrillCat => ({
  id: NON_CLASSE_ID,
  nom: 'Non classé',
  parent_id: null,
  site_id: null,
  description: null,
  miniature_id: null,
  ordre: 9999,
  virtual: true,
})

const CVC: CatalogueDrillCat = {
  id: idAt(0),
  nom: 'CVC',
  parent_id: null,
  site_id: 'site-1',
  description: null,
  miniature_id: null,
  ordre: 1,
  virtual: false,
}
const CHAUDIERES: CatalogueDrillCat = {
  ...CVC,
  id: idAt(1),
  nom: 'Chaudières',
  parent_id: CVC.id,
  ordre: 1,
}
const ELEC: CatalogueDrillCat = {
  ...CVC,
  id: idAt(2),
  nom: 'Électricité',
  parent_id: null,
  ordre: 2,
}
const CATS = [CVC, CHAUDIERES, ELEC]

const visite: Gamme = {
  id: idAt(10),
  nom: 'Visite annuelle',
  categorie_id: CHAUDIERES.id,
}
const ramonage: Gamme = {
  id: idAt(11),
  nom: 'Ramonage',
  categorie_id: CHAUDIERES.id,
}
const legacy: Gamme = { id: idAt(12), nom: 'Import legacy', categorie_id: null }

function monter(opts: {
  cats?: CatalogueDrillCat[]
  items: Gamme[]
  segs0: string[]
  onNavigate?: NavigateTo
}) {
  const onNavigate = opts.onNavigate ?? vi.fn<NavigateTo>()
  const rendu = renderHook(
    ({ cats, items }: { cats: CatalogueDrillCat[]; items: Gamme[] }) =>
      useCatalogueDrill({
        realCats: cats,
        makeVirtual,
        items,
        getItemId,
        getItemNom,
        getCategorieId,
        useDrill: useDrillTest,
      }),
    {
      initialProps: { cats: opts.cats ?? CATS, items: opts.items },
      wrapper: ({ children }: { children: ReactNode }) => (
        <FauxRouteur segs0={opts.segs0} onNavigate={onNavigate}>
          {children}
        </FauxRouteur>
      ),
    },
  )
  return { ...rendu, onNavigate }
}

describe('useCatalogueDrill — aller-retour d’identité (O1)', () => {
  it('goToItem produit une URL qui rouvre exactement le même élément', () => {
    const nav = vi.fn<NavigateTo>()
    const { result } = monter({
      items: [visite, ramonage],
      segs0: [],
      onNavigate: nav,
    })

    act(() => {
      result.current.goToItem(visite)
    })

    // Le faux routeur a appliqué l'URL : l'élément est ouvert au bon palier.
    expect(nav).toHaveBeenCalledWith(['cvc', 'chaudieres'], 'visite-annuelle', {
      replace: false,
    })
    expect(result.current.openItem).toBe(visite)
    expect(result.current.path.map((c) => c.nom)).toEqual(['CVC', 'Chaudières'])
  })

  it('résout la feuille d’un deep-link complet', () => {
    const { result } = monter({
      items: [visite, ramonage],
      segs0: ['cvc', 'chaudieres', 'ramonage'],
    })
    expect(result.current.openItem).toBe(ramonage)
  })

  it('ouvre un élément homonyme d’un frère (segment désambiguïsé)', () => {
    const jumelle: Gamme = {
      id: idAt(13),
      nom: 'Visite annuelle',
      categorie_id: CHAUDIERES.id,
    }
    const nav = vi.fn<NavigateTo>()
    const { result } = monter({
      items: [visite, jumelle],
      segs0: [],
      onNavigate: nav,
    })

    act(() => {
      result.current.goToItem(jumelle)
    })
    // O1 : chacun garde son identité malgré le nom identique.
    expect(result.current.openItem).toBe(jumelle)
    expect(nav.mock.calls[0]?.[1]).toBe(
      `visite-annuelle~${jumelle.id.slice(0, 8)}`,
    )
  })
})

describe('useCatalogueDrill — renommage en direct (O2)', () => {
  it('garde l’élément ouvert et ne réécrit l’URL qu’une fois', () => {
    const nav = vi.fn<NavigateTo>()
    const { result, rerender } = monter({
      items: [visite, ramonage],
      segs0: ['cvc', 'chaudieres', 'visite-annuelle'],
      onNavigate: nav,
    })
    expect(result.current.openItem).toBe(visite)

    const renomme: Gamme = { ...visite, nom: 'Visite annuelle Nord' }
    rerender({ cats: CATS, items: [renomme, ramonage] })

    // O2 : toujours ouvert (même id), une seule réécriture, en `replace`.
    expect(result.current.openItem?.id).toBe(visite.id)
    expect(nav).toHaveBeenCalledTimes(1)
    expect(nav).toHaveBeenCalledWith(
      ['cvc', 'chaudieres'],
      'visite-annuelle-nord',
      { replace: true },
    )

    // Un re-rendu de plus (refetch) ne relance pas de navigation.
    rerender({ cats: CATS, items: [renomme, ramonage] })
    expect(nav).toHaveBeenCalledTimes(1)
  })

  it('suit un renommage vers un nom non slugifiable (repli sur l’id)', () => {
    const nav = vi.fn<NavigateTo>()
    const { result, rerender } = monter({
      items: [visite],
      segs0: ['cvc', 'chaudieres', 'visite-annuelle'],
      onNavigate: nav,
    })
    const renomme: Gamme = { ...visite, nom: '###' }
    rerender({ cats: CATS, items: [renomme] })

    expect(nav).toHaveBeenCalledTimes(1)
    expect(nav.mock.calls[0]?.[1]).toBe(visite.id)
    expect(result.current.openItem?.id).toBe(visite.id)
  })

  it('suit un renommage qui crée une collision avec un frère', () => {
    const nav = vi.fn<NavigateTo>()
    const { result, rerender } = monter({
      items: [visite, ramonage],
      segs0: ['cvc', 'chaudieres', 'visite-annuelle'],
      onNavigate: nav,
    })
    // « Visite annuelle » devient homonyme de « Ramonage ».
    const renomme: Gamme = { ...visite, nom: 'Ramonage' }
    rerender({ cats: CATS, items: [renomme, ramonage] })

    expect(nav).toHaveBeenCalledTimes(1)
    expect(nav.mock.calls[0]?.[1]).toBe(`ramonage~${visite.id.slice(0, 8)}`)
    expect(result.current.openItem?.id).toBe(visite.id)
  })

  it('suit un DÉPLACEMENT vers une autre catégorie (chemin refait)', () => {
    const nav = vi.fn<NavigateTo>()
    const { result, rerender } = monter({
      items: [visite],
      segs0: ['cvc', 'chaudieres', 'visite-annuelle'],
      onNavigate: nav,
    })
    const deplace: Gamme = { ...visite, categorie_id: ELEC.id }
    rerender({ cats: CATS, items: [deplace] })

    expect(nav).toHaveBeenCalledTimes(1)
    expect(nav).toHaveBeenCalledWith(['electricite'], 'visite-annuelle', {
      replace: true,
    })
    expect(result.current.openItem?.id).toBe(visite.id)
    expect(result.current.path.map((c) => c.nom)).toEqual(['Électricité'])
  })
})

describe('useCatalogueDrill — élément absent ou inconnu (O3/O4)', () => {
  it('suppression de l’élément ouvert : rien d’ouvert, aucune navigation', () => {
    const nav = vi.fn<NavigateTo>()
    const { result, rerender } = monter({
      items: [visite, ramonage],
      segs0: ['cvc', 'chaudieres', 'visite-annuelle'],
      onNavigate: nav,
    })
    rerender({ cats: CATS, items: [ramonage] })

    expect(result.current.openItem).toBeNull()
    expect(nav).not.toHaveBeenCalled()
    // Le palier reste affichable : on retombe sur la liste de la catégorie.
    expect(result.current.current).toBe(CHAUDIERES)
  })

  it('feuille inconnue au montage : rien d’ouvert, pas de boucle (O4)', () => {
    const nav = vi.fn<NavigateTo>()
    const { result } = monter({
      items: [visite],
      segs0: ['cvc', 'chaudieres', 'gamme-jamais-vue'],
      onNavigate: nav,
    })
    expect(result.current.openItem).toBeNull()
    expect(nav).not.toHaveBeenCalled()
  })

  it('catégorie parente renommée : chemin tronqué, sans navigation parasite', () => {
    const nav = vi.fn<NavigateTo>()
    const { result, rerender } = monter({
      items: [visite],
      segs0: ['cvc', 'chaudieres', 'visite-annuelle'],
      onNavigate: nav,
    })
    rerender({
      cats: [{ ...CVC, nom: 'CVC / Froid' }, CHAUDIERES, ELEC],
      items: [visite],
    })

    // « Drill tolérant » : on remonte à la racine, on ne corrige pas l'URL.
    expect(result.current.path).toEqual([])
    expect(result.current.openItem).toBeNull()
    expect(nav).not.toHaveBeenCalled()
  })

  it('segment de feuille hostile (très long, caractères spéciaux) : pas d’exception', () => {
    const { result } = monter({
      items: [visite],
      segs0: ['cvc', 'chaudieres', 'x'.repeat(5000)],
    })
    expect(result.current.openItem).toBeNull()
  })
})

describe('useCatalogueDrill — bac « Non classé » (O5)', () => {
  it('n’existe que s’il y a des orphelins', () => {
    const sansOrphelin = monter({ items: [visite], segs0: [] })
    expect(
      sansOrphelin.result.current.drillCats.some((c) => c.id === NON_CLASSE_ID),
    ).toBe(false)
    sansOrphelin.unmount()

    const avecOrphelin = monter({ items: [visite, legacy], segs0: [] })
    expect(
      avecOrphelin.result.current.drillCats.some((c) => c.id === NON_CLASSE_ID),
    ).toBe(true)
    expect(avecOrphelin.result.current.orphans).toEqual([legacy])
  })

  it('range aussi les éléments d’une catégorie INVISIBLE (hors périmètre)', () => {
    const fantome: Gamme = {
      id: idAt(14),
      nom: 'Gamme du siège',
      categorie_id: 'categorie-absente-du-perimetre',
    }
    const { result } = monter({ items: [visite, fantome], segs0: [] })
    // Règle : ne JAMAIS cacher un élément dont la catégorie n'est pas affichée ici.
    expect(result.current.isRoot(fantome)).toBe(true)
    expect(result.current.orphans).toEqual([fantome])
  })

  it('ouvre un orphelin par URL via le bac (aller-retour) (O1/O5)', () => {
    const nav = vi.fn<NavigateTo>()
    const { result } = monter({
      items: [visite, legacy],
      segs0: [],
      onNavigate: nav,
    })

    act(() => {
      result.current.goToItem(legacy)
    })
    expect(nav.mock.calls[0]?.[0]).toEqual(['non-classe'])
    expect(result.current.openItem).toBe(legacy)
    expect(result.current.current?.id).toBe(NON_CLASSE_ID)
  })

  it('classe le bac en DERNIER parmi les sous-catégories de la racine', () => {
    const { result } = monter({ items: [visite, legacy], segs0: [] })
    const noms = result.current.childCategories.map((c) => c.nom)
    // `ordre` 9999 → toujours après les catégories réelles.
    expect(noms.at(-1)).toBe('Non classé')
  })
})

describe('useCatalogueDrill — regroupement des éléments', () => {
  it('itemsUnder : bac → orphelins, null → aucun, sinon la catégorie', () => {
    const { result } = monter({ items: [visite, ramonage, legacy], segs0: [] })
    expect(result.current.itemsUnder(NON_CLASSE_ID)).toEqual([legacy])
    expect(result.current.itemsUnder(null)).toEqual([])
    expect(result.current.itemsUnder(CHAUDIERES.id)).toEqual([visite, ramonage])
  })

  it('itemsInCurrent trie par ordre NATUREL (5 < 5.1 < 6 < 10)', () => {
    const numerotees: Gamme[] = ['10', '5.1', '6', '5'].map((n, i) => ({
      id: idAt(20 + i),
      nom: `Opération ${n}`,
      categorie_id: CHAUDIERES.id,
    }))
    const { result } = monter({
      items: numerotees,
      segs0: ['cvc', 'chaudieres'],
    })
    expect(result.current.itemsInCurrent.map((g) => g.nom)).toEqual([
      'Opération 5',
      'Opération 5.1',
      'Opération 6',
      'Opération 10',
    ])
  })

  it('catChain remonte la hiérarchie complète, et s’arrête sur un id inconnu', () => {
    const { result } = monter({ items: [visite], segs0: [] })
    expect(result.current.catChain(CHAUDIERES.id)).toEqual([CVC, CHAUDIERES])
    expect(result.current.catChain(null)).toEqual([])
    expect(result.current.catChain('id-inconnu')).toEqual([])
  })
})
