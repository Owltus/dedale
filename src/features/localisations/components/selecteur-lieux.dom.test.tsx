import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SelecteurLieux } from './selecteur-lieux'

/**
 * Sélecteur de lieux : arbre bâtiment → niveau → lieu à cases. Faux client :
 * chaque table répond par `REPONSES[table]` ; `throwOnError` « envoie ».
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { table: string; chaine: string[] }[],
  echec: false,
}))
const REPONSES: Record<string, unknown[]> = {
  batiments: [
    { id: 'bA', nom: 'Bâtiment A' },
    { id: 'bB', nom: 'Bâtiment B' },
  ],
  niveaux: [
    { id: 'nA1', nom: 'R+1', batiment_id: 'bA' },
    { id: 'nA2', nom: 'R+2', batiment_id: 'bA' },
    { id: 'nB0', nom: 'RDC', batiment_id: 'bB' },
  ],
  locaux: [
    { id: 'l101', nom: 'Chambre 101', niveau_id: 'nA1', type_local_id: 1 },
    { id: 'l102', nom: 'Chambre 102', niveau_id: 'nA1', type_local_id: 1 },
    { id: 'lOff', nom: 'Office R+1', niveau_id: 'nA1', type_local_id: 2 },
    { id: 'l201', nom: 'Chambre 201', niveau_id: 'nA2', type_local_id: 1 },
    { id: 'lHall', nom: 'Hall', niveau_id: 'nB0', type_local_id: null },
  ],
  types_locaux: [
    { id: 1, libelle: 'Chambre' },
    { id: 2, libelle: 'Office' },
  ],
}
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const appel = { table, chaine: [] as string[] }
      reseau.appels.push(appel)
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_c, m: string) {
            if (m === 'then') return undefined
            if (m === 'throwOnError')
              return () =>
                reseau.echec
                  ? Promise.reject(new Error('panne'))
                  : Promise.resolve({
                      data: REPONSES[table] ?? [],
                      error: null,
                    })
            return (...args: unknown[]) => {
              appel.chaine.push(`${m}(${args.map(String).join(',')})`)
              return proxy
            }
          },
        },
      )
      return proxy
    },
  },
}))

const changements: string[][] = []

function monter(initiaux: string[] = []) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function Hote() {
    const [ids, setIds] = useState<string[]>(initiaux)
    return (
      <SelecteurLieux
        siteId="site-1"
        value={ids}
        onChange={(v) => {
          changements.push([...v].sort())
          setIds(v)
        }}
      />
    )
  }
  render(
    <QueryClientProvider client={qc}>
      <Hote />
    </QueryClientProvider>,
  )
}

// Nom accessible d'une case = titre + sous-titre (« R+1 » puis « 3 lieux ») :
// on cible par le début (titre) puis on vérifie le compte quand il importe.
const caseDe = (titre: string, compte?: string) =>
  screen.getByRole('checkbox', {
    name: (n) =>
      n.startsWith(titre) && (compte === undefined || n.endsWith(compte)),
  })
const dernier = () => changements.at(-1)

beforeEach(() => {
  reseau.appels = []
  reseau.echec = false
  changements.length = 0
})

describe('SelecteurLieux — lecture', () => {
  it('lit l’arbre du site PAR PAGES (jamais de lecture nue) et le type des lieux', async () => {
    monter()
    await screen.findByRole('checkbox', { name: /Bâtiment A/ })
    const locaux = reseau.appels.find((a) => a.table === 'locaux')
    expect(locaux?.chaine).toContain(
      'select(id, nom, niveau_id, type_local_id)',
    )
    expect(locaux?.chaine.some((c) => c.startsWith('range(0,999)'))).toBe(true)
    const bat = reseau.appels.find((a) => a.table === 'batiments')
    expect(bat?.chaine).toContain('eq(site_id,site-1)')
  })

  it('panne : message d’erreur, pas un arbre vide', async () => {
    reseau.echec = true
    monter()
    expect(
      await screen.findByText('Impossible de charger les lieux du site.'),
    ).toBeInTheDocument()
  })
})

describe('SelecteurLieux — cases de groupe', () => {
  it('cocher un bâtiment coche tous ses lieux ; recocher le décoche', async () => {
    monter()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('checkbox', { name: /Bâtiment A/ }))
    expect(dernier()).toEqual(['l101', 'l102', 'l201', 'lOff'])
    expect(screen.getByText('4 lieux sélectionnés')).toBeInTheDocument()
    await u.click(caseDe('Bâtiment A', '4 lieux'))
    expect(dernier()).toEqual([])
  })

  it('cocher un niveau coche ses lieux ; le bâtiment passe à « partiel »', async () => {
    monter()
    const u = userEvent.setup()
    await u.click(
      await screen.findByRole('button', { name: 'Déplier Bâtiment A' }),
    )
    await u.click(caseDe('R+1', '3 lieux'))
    expect(dernier()).toEqual(['l101', 'l102', 'lOff'])
    expect(caseDe('Bâtiment A', '4 lieux')).toHaveAttribute(
      'data-state',
      'indeterminate',
    )
  })

  it('déplier au clavier, cocher un lieu seul', async () => {
    monter()
    const u = userEvent.setup()
    const deplier = await screen.findByRole('button', {
      name: 'Déplier Bâtiment B',
    })
    expect(deplier).toHaveAttribute('aria-expanded', 'false')
    deplier.focus()
    await u.keyboard('{Enter}')
    expect(
      screen.getByRole('button', { name: 'Replier Bâtiment B' }),
    ).toHaveAttribute('aria-expanded', 'true')
    await u.click(screen.getByRole('button', { name: 'Déplier RDC' }))
    await u.click(caseDe('Hall'))
    expect(dernier()).toEqual(['lHall'])
  })

  it('lieu pré-coché : son bâtiment et son niveau sont dépliés', async () => {
    monter(['l201'])
    expect(
      await screen.findByRole('checkbox', { name: /Chambre 201/ }),
    ).toBeChecked()
    expect(screen.getByText('1 lieu sélectionné')).toBeInTheDocument()
  })
})

describe('SelecteurLieux — filtre et recherche', () => {
  it('filtre par type : le niveau ne coche que les lieux de ce type', async () => {
    monter()
    const u = userEvent.setup()
    await u.click(
      await screen.findByRole('combobox', { name: 'Filtrer par type de lieu' }),
    )
    await u.click(await screen.findByRole('option', { name: 'Chambre' }))
    // Le bâtiment B (Hall, sans type) disparaît ; A ne compte que ses chambres.
    expect(screen.queryByRole('checkbox', { name: /Bâtiment B/ })).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Déplier Bâtiment A' }))
    await u.click(caseDe('R+1', '2 lieux'))
    expect(dernier()).toEqual(['l101', 'l102'])
  })

  it('recherche (casse et accents ignorés) : arbre déplié sur les seuls lieux trouvés', async () => {
    monter()
    const u = userEvent.setup()
    await u.type(
      await screen.findByRole('textbox', { name: /Rechercher un lieu/ }),
      'OFFICE',
    )
    expect(caseDe('Office R+1')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Chambre 101/ })).toBeNull()
    await u.click(
      screen.getByRole('button', { name: 'Cocher les 1 lieu affichés' }),
    )
    expect(dernier()).toEqual(['lOff'])
    await u.clear(screen.getByRole('textbox', { name: /Rechercher un lieu/ }))
    await u.type(
      screen.getByRole('textbox', { name: /Rechercher un lieu/ }),
      'zzz',
    )
    expect(
      screen.getByText('Aucun lieu ne correspond à ces critères.'),
    ).toBeInTheDocument()
  })

  it('« Tout décocher » vide la sélection', async () => {
    monter(['l101', 'lHall'])
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Tout décocher' }))
    expect(dernier()).toEqual([])
    expect(
      within(document.body).getByText('Aucun lieu sélectionné'),
    ).toBeInTheDocument()
  })
})
