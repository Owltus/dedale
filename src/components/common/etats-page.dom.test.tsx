import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import { Wrench } from 'lucide-react'
import { QueryState } from '@/components/common/query-state'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { PageEnPreparation } from '@/components/common/page-en-preparation'
import {
  TIRAGES,
  queryAboutie,
  queryEnChargement,
  queryEnErreur,
  renderAvecRouteur,
  texteHostileArb,
} from '@/test/harness'

/**
 * ÉTATS DE BORD des pages. Ces briques sont la seule chose que l'utilisateur
 * voit quand les données manquent : un état qui ne s'affiche pas, ou deux qui
 * s'affichent ensemble, se lit comme une panne.
 */

/** Marqueurs distinctifs des trois branches de `QueryState`. */
const SQUELETTE = 'squelette-de-chargement'
const VIDE = 'aucune-donnee'

describe('QueryState — règle des 4 états', () => {
  // ORACLE : docs/conventions/composants.md — « chargement → pending, erreur →
  // ErrorState (avec retry), tableau vide → empty, sinon children(data) ».
  // Chaque état est EXCLUSIF : deux états simultanés décrivent deux vérités
  // contradictoires sur la même requête.
  it('en chargement : rend le squelette, et RIEN d’autre', () => {
    const children = vi.fn(() => <div>contenu</div>)
    render(
      <QueryState
        query={queryEnChargement<string[]>()}
        pending={<div>{SQUELETTE}</div>}
        empty={<div>{VIDE}</div>}
      >
        {children}
      </QueryState>,
    )

    expect(screen.getByText(SQUELETTE)).toBeInTheDocument()
    expect(screen.queryByText(VIDE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
    expect(children).not.toHaveBeenCalled()
  })

  // ORACLE : même règle — en erreur, l'utilisateur doit voir une ERREUR (et
  // pouvoir relancer), jamais une absence de données.
  it('en erreur : rend l’état d’erreur avec un bouton de reprise, et RIEN d’autre', () => {
    const children = vi.fn(() => <div>contenu</div>)
    render(
      <QueryState
        query={queryEnErreur<string[]>()}
        pending={<div>{SQUELETTE}</div>}
        empty={<div>{VIDE}</div>}
      >
        {children}
      </QueryState>,
    )

    expect(
      screen.getByRole('button', { name: 'Réessayer' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(SQUELETTE)).not.toBeInTheDocument()
    expect(screen.queryByText(VIDE)).not.toBeInTheDocument()
    expect(children).not.toHaveBeenCalled()
  })

  // ORACLE : le bouton de reprise DOIT relancer la requête (sinon il ment).
  it('en erreur : « Réessayer » appelle refetch exactement une fois', async () => {
    const utilisateur = userEvent.setup()
    const refetch = vi.fn(() => Promise.resolve(undefined))
    render(
      <QueryState
        query={queryEnErreur<string[]>(refetch)}
        pending={<div>{SQUELETTE}</div>}
      >
        {() => <div>contenu</div>}
      </QueryState>,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  // ORACLE : « tableau vide → empty ». C'est le seul cas où `empty` s'applique.
  it('tableau vide : rend l’état vide, et RIEN d’autre', () => {
    const children = vi.fn(() => <div>contenu</div>)
    render(
      <QueryState
        query={queryAboutie<string[]>([])}
        pending={<div>{SQUELETTE}</div>}
        empty={<div>{VIDE}</div>}
      >
        {children}
      </QueryState>,
    )

    expect(screen.getByText(VIDE)).toBeInTheDocument()
    expect(screen.queryByText(SQUELETTE)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
    expect(children).not.toHaveBeenCalled()
  })

  // ORACLE : `empty` est OPTIONNEL — sans lui, l'appelant rend lui-même le vide,
  // donc la render-prop doit être appelée avec le tableau vide.
  it('tableau vide SANS état vide fourni : la render-prop reçoit le tableau vide', () => {
    const children = vi.fn(() => <div>contenu</div>)
    render(
      <QueryState query={queryAboutie<string[]>([])} pending={<div>x</div>}>
        {children}
      </QueryState>,
    )

    expect(children).toHaveBeenCalledTimes(1)
    expect(children).toHaveBeenCalledWith([])
  })

  // ORACLE : « sinon le contenu via render-prop (data garanti défini) ».
  it('données présentes : la render-prop reçoit exactement `data`', () => {
    const data = ['Chaufferie', 'Ascenseur']
    const children = vi.fn((items: string[]) => <div>{items.join(' · ')}</div>)
    render(
      <QueryState
        query={queryAboutie(data)}
        pending={<div>{SQUELETTE}</div>}
        empty={<div>{VIDE}</div>}
      >
        {children}
      </QueryState>,
    )

    expect(children).toHaveBeenCalledWith(data)
    expect(screen.queryByText(VIDE)).not.toBeInTheDocument()
  })

  // ORACLE : `empty` ne concerne QUE les tableaux vides. Un objet « vide » au
  // sens métier reste une donnée : le masquer effacerait une fiche réelle.
  it('donnée non-tableau : le contenu est rendu même si `empty` est fourni', () => {
    const children = vi.fn(() => <div>fiche</div>)
    render(
      <QueryState
        query={queryAboutie({ id: 1 })}
        pending={<div>{SQUELETTE}</div>}
        empty={<div>{VIDE}</div>}
      >
        {children}
      </QueryState>,
    )

    expect(screen.getByText('fiche')).toBeInTheDocument()
    expect(screen.queryByText(VIDE)).not.toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  // ORACLE : l'état d'erreur porte un message par défaut — un écran d'erreur
  // muet ne dit pas à l'utilisateur ce qui s'est passé.
  it('affiche un message par défaut en français', () => {
    render(<ErrorState />)
    expect(screen.getByText('Une erreur est survenue.')).toBeInTheDocument()
  })

  // ORACLE : le message est surchargeable par l'appelant.
  it('affiche le message fourni à la place du message par défaut', () => {
    render(<ErrorState message="Impossible de charger les équipements." />)
    expect(
      screen.getByText('Impossible de charger les équipements.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Une erreur est survenue.')).toBeNull()
  })

  // ORACLE : pas d'affordance sans action — un bouton « Réessayer » sans
  // `onRetry` serait un bouton inerte.
  it('sans onRetry : aucun bouton', () => {
    render(<ErrorState />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ORACLE : accessibilité — le bouton a un NOM accessible, et l'action part
  // une seule fois par clic.
  it('avec onRetry : bouton nommé « Réessayer », appelé une fois par clic', async () => {
    const utilisateur = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)

    const bouton = screen.getByRole('button', { name: 'Réessayer' })
    await utilisateur.click(bouton)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyState', () => {
  // ORACLE : le titre d'un état vide est un TITRE (h3) — c'est ce qui permet à
  // un lecteur d'écran de sauter directement à « il n'y a rien ici ».
  it('rend le titre comme un titre de niveau 3', () => {
    render(<EmptyState title="Aucun équipement" />)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Aucun équipement' }),
    ).toBeInTheDocument()
  })

  // ORACLE : description et action sont OPTIONNELLES et rendues quand fournies.
  it('rend la description et l’action fournies', () => {
    render(
      <EmptyState
        icon={Wrench}
        title="Aucun équipement"
        description="Ajoute un premier équipement sur ce site."
        action={<button type="button">Nouvel équipement</button>}
      />,
    )
    expect(
      screen.getByText('Ajoute un premier équipement sur ce site.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Nouvel équipement' }),
    ).toBeInTheDocument()
  })

  // ORACLE : sans description ni action, rien d'autre que le titre — un état
  // vide ne doit pas fabriquer de texte qu'on ne lui a pas donné.
  it('sans description ni action : aucun bouton', () => {
    render(<EmptyState title="Aucun équipement" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ORACLE (sécurité d'affichage) : un titre/description venant des DONNÉES
  // (nom saisi, import CSV) est du TEXTE. React échappe ; on le vérifie plutôt
  // que de le supposer, car un passage à `dangerouslySetInnerHTML` ne se verrait
  // dans aucun autre test.
  it('fuzzing : titre et description restent du texte, jamais du balisage', () => {
    fc.assert(
      fc.property(texteHostileArb, texteHostileArb, (titre, description) => {
        const { container, unmount } = render(
          <EmptyState title={titre} description={description} />,
        )
        try {
          // Aucun élément n'a été FABRIQUÉ à partir du contenu.
          expect(container.querySelector('script')).toBeNull()
          expect(container.querySelector('img')).toBeNull()
          expect(container.querySelector('b')).toBeNull()
          // Le contenu est présent en TEXTE (le titre non vide est visible).
          if (titre.trim() !== '') {
            expect(container.textContent).toContain(titre)
          }
        } finally {
          unmount()
        }
      }),
      TIRAGES,
    )
  })
})

describe('NoSearchResults', () => {
  // ORACLE : l'état « aucun résultat » se distingue de l'état « aucune donnée »
  // par son titre — sinon l'utilisateur croit que la base est vide.
  it('titre « Aucun résultat » et description générique par défaut', () => {
    render(<NoSearchResults />)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Aucun résultat' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Aucun élément ne correspond à ta recherche.'),
    ).toBeInTheDocument()
  })

  // ORACLE : documenté dans le composant — sans `onReset`, pas de bouton
  // « Afficher tout ».
  it('sans onReset : aucun bouton « Afficher tout »', () => {
    render(<NoSearchResults description="Aucun ordre de travail." />)
    expect(screen.queryByRole('button', { name: 'Afficher tout' })).toBeNull()
  })

  // ORACLE : avec un filtre actif, le bouton révèle le reste — et n'agit
  // qu'une fois par clic.
  it('avec onReset : bouton « Afficher tout » appelé une seule fois', async () => {
    const utilisateur = userEvent.setup()
    const onReset = vi.fn()
    render(<NoSearchResults onReset={onReset} />)

    await utilisateur.click(
      screen.getByRole('button', { name: 'Afficher tout' }),
    )
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe('NoSiteSelected', () => {
  // ORACLE : l'écran garde l'IDENTITÉ de la page (titre + description) et
  // ajoute l'invitation — sinon l'utilisateur ne sait plus où il est.
  it('affiche le titre de la page ET l’invitation à choisir un site', async () => {
    renderAvecRouteur(
      <NoSiteSelected
        title="Équipements"
        description="Le parc du site."
        hint="Choisis un site pour voir son parc."
        icon={Wrench}
      />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Équipements' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Le parc du site.')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Sélectionne un site' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Choisis un site pour voir son parc.'),
    ).toBeInTheDocument()
  })
})

describe('PageEnPreparation', () => {
  // ORACLE : documenté dans le composant — « l'écran doit dire clairement qu'il
  // n'y a rien à voir ENCORE ; une page vide se lit comme un bug ».
  it('affiche le titre de la section et le message « en préparation »', async () => {
    renderAvecRouteur(
      <PageEnPreparation
        titre="Registre"
        description="Le registre de l’ERP."
      />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Registre' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Section en préparation' }),
    ).toBeInTheDocument()
  })
})
