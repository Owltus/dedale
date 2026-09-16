import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import { Pencil, Trash2 } from 'lucide-react'
import { ListRow, MEDIA_HEIGHT, type ListRowSize } from './list-row'
import type { RowAction } from './row-actions'
import { TIRAGES, texteHostileArb } from '@/test/harness'

/**
 * `ListRow` est la brique la plus réutilisée de l'application : toute liste de
 * l'app en est faite. Les invariants testés ici sont ceux que sa documentation
 * PROMET aux pages qui la consomment.
 */

/** Toutes les densités du système, pour les propriétés « quelle que soit la taille ». */
const TAILLES: ListRowSize[] = ['xs', 'fine', 'sm', 'md', 'lg']

/** La card = le premier `div` rendu (la ligne elle-même). */
function card(container: HTMLElement): HTMLElement {
  const el = container.firstElementChild
  if (!(el instanceof HTMLElement)) throw new Error('Aucune card rendue')
  return el
}

describe('ListRow — nom accessible et clic', () => {
  // ORACLE : documenté dans le composant — « Cliquable : un vrai <button>
  // ÉTIRÉ en overlay porte l'action », dont le nom accessible est le TITRE
  // visible (aria-labelledby). Sans nom, la ligne est un bouton anonyme pour
  // un lecteur d'écran.
  it('cliquable : expose un bouton dont le nom accessible est le titre', () => {
    render(<ListRow title="Chaufferie" onClick={() => undefined} />)
    expect(
      screen.getByRole('button', { name: 'Chaufferie' }),
    ).toBeInTheDocument()
  })

  // ORACLE : `titleLabel` « surcharge le nom accessible de la ligne cliquable ».
  it('titleLabel surcharge le nom accessible', () => {
    render(
      <ListRow
        title={<span>CH-01</span>}
        titleLabel="Chaufferie principale"
        onClick={() => undefined}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Chaufferie principale' }),
    ).toBeInTheDocument()
  })

  // ORACLE : « Rend toute la ligne cliquable » est OPT-IN — sans `onClick`,
  // aucun élément interactif ne doit apparaître (une ligne inerte qui prend le
  // focus est un piège au clavier).
  it('non cliquable : aucun bouton', () => {
    render(<ListRow title="Chaufferie" subtitle="Sous-sol" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ORACLE : un clic = une action. Un double déclenchement ouvrirait deux fois
  // la fiche (ou créerait deux enregistrements sur une ligne d'action).
  it('un clic déclenche onClick exactement une fois', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    render(<ListRow title="Chaufferie" onClick={onClick} />)

    await utilisateur.click(screen.getByRole('button', { name: 'Chaufferie' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // ORACLE : accessibilité clavier — l'overlay est un vrai <button>, donc
  // Entrée et Espace l'activent nativement.
  it('s’active au clavier (Entrée) une seule fois', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    render(<ListRow title="Chaufferie" onClick={onClick} />)

    await utilisateur.tab()
    expect(screen.getByRole('button', { name: 'Chaufferie' })).toHaveFocus()
    await utilisateur.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('ListRow — indépendance des éléments interactifs internes', () => {
  // ORACLE : documenté dans le composant — « Les actions, badges et mobileBadge,
  // posés au-dessus (z-10), restent indépendants du drill-down sans
  // stopPropagation ». Le projet a déjà eu un bug de remontée d'événement à
  // travers un portail : on vérifie l'invariant, on ne le suppose pas.
  it('un clic sur un bouton de `badges` ne déclenche PAS le clic de la ligne', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    const onBadge = vi.fn()
    render(
      <ListRow
        title="Chaufferie"
        onClick={onClick}
        badges={
          <button type="button" onClick={onBadge}>
            Documents
          </button>
        }
      />,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Documents' }))
    expect(onBadge).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  // ORACLE : même règle pour l'ancien slot `actions` — « Un clic dessus ne
  // déclenche pas onClick ».
  it('un clic sur une action de ligne ne déclenche PAS le clic de la ligne', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    const onSupprimer = vi.fn()
    render(
      <ListRow
        title="Chaufferie"
        onClick={onClick}
        actions={
          <button type="button" aria-label="Supprimer" onClick={onSupprimer}>
            <Trash2 />
          </button>
        }
      />,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onSupprimer).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  // ORACLE : même règle pour `mobileBadge` (même z-10, même promesse).
  it('un clic sur `mobileBadge` ne déclenche PAS le clic de la ligne', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    const onBadge = vi.fn()
    render(
      <ListRow
        title="Chaufferie"
        onClick={onClick}
        mobileBadge={
          <button type="button" onClick={onBadge}>
            En retard
          </button>
        }
      />,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'En retard' }))
    expect(onBadge).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  // ORACLE : la variante MÉDIA place le même overlay ; la promesse ne change pas
  // parce qu'il y a une vignette.
  it('variante média : un clic sur un badge ne déclenche PAS le clic de la ligne', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    const onBadge = vi.fn()
    render(
      <ListRow
        title="Chaufferie"
        media={<div data-testid="vignette" />}
        onClick={onClick}
        badges={
          <button type="button" onClick={onBadge}>
            Documents
          </button>
        }
      />,
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Documents' }))
    expect(onBadge).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ListRow — menu contextuel', () => {
  const actions = (
    onModifier: () => void,
    onSupprimer: () => void,
  ): RowAction[] => [
    { label: 'Modifier', icon: Pencil, onSelect: onModifier },
    {
      label: 'Supprimer',
      icon: Trash2,
      destructive: true,
      onSelect: onSupprimer,
    },
  ]

  // ORACLE : documenté — « clic droit / appui long sur la card ouvrent un menu
  // contextuel. Aucun bouton déclencheur visible ».
  it('le clic droit ouvre le menu et liste les actions fournies', async () => {
    const utilisateur = userEvent.setup()
    const { container } = render(
      <ListRow
        title="Chaufferie"
        menuActions={actions(
          () => undefined,
          () => undefined,
        )}
      />,
    )

    await utilisateur.pointer({ target: card(container), keys: '[MouseRight]' })

    expect(
      await screen.findByRole('menuitem', { name: 'Modifier' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toBeVisible()
  })

  // ORACLE : le menu est rendu dans un PORTAIL. Choisir un item ne doit pas
  // faire remonter le clic jusqu'à la ligne (bug de bubbling déjà rencontré
  // sur ce projet), sans quoi « Supprimer » ouvrirait aussi la fiche.
  it('choisir un item appelle son action une fois et PAS le clic de la ligne', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    const onSupprimer = vi.fn()
    const { container } = render(
      <ListRow
        title="Chaufferie"
        onClick={onClick}
        menuActions={actions(() => undefined, onSupprimer)}
      />,
    )

    await utilisateur.pointer({ target: card(container), keys: '[MouseRight]' })
    await utilisateur.click(
      await screen.findByRole('menuitem', { name: 'Supprimer' }),
    )

    expect(onSupprimer).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  // ORACLE : documenté — « le clic droit n'ouvre PAS le drill-down (qui ne
  // réagit qu'au clic gauche) ».
  it('le clic droit ne déclenche pas le drill-down', async () => {
    const utilisateur = userEvent.setup()
    const onClick = vi.fn()
    const { container } = render(
      <ListRow
        title="Chaufferie"
        onClick={onClick}
        menuActions={actions(
          () => undefined,
          () => undefined,
        )}
      />,
    )

    await utilisateur.pointer({ target: card(container), keys: '[MouseRight]' })
    await screen.findByRole('menuitem', { name: 'Modifier' })
    expect(onClick).not.toHaveBeenCalled()
  })

  // ORACLE : `hasMenu` exige une liste NON VIDE — une page qui filtre toutes
  // les actions par permission ne doit pas laisser un menu vide s'ouvrir.
  it('liste d’actions vide : aucun menu ne s’ouvre', async () => {
    const utilisateur = userEvent.setup()
    const { container } = render(
      <ListRow title="Chaufferie" menuActions={[]} />,
    )

    await utilisateur.pointer({ target: card(container), keys: '[MouseRight]' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  // ORACLE : une action `disabled` est présentée mais NON déclenchable.
  it('un item désactivé ne déclenche pas son action', async () => {
    const utilisateur = userEvent.setup()
    const onSupprimer = vi.fn()
    const { container } = render(
      <ListRow
        title="Chaufferie"
        menuActions={[
          {
            label: 'Supprimer',
            icon: Trash2,
            destructive: true,
            disabled: true,
            onSelect: onSupprimer,
          },
        ]}
      />,
    )

    await utilisateur.pointer({ target: card(container), keys: '[MouseRight]' })
    const item = await screen.findByRole('menuitem', { name: 'Supprimer' })
    await utilisateur.click(item)
    expect(onSupprimer).not.toHaveBeenCalled()
  })
})

describe('ListRow — densités et vignette', () => {
  // ORACLE : `MEDIA_HEIGHT` est EXPORTÉE comme « source unique des hauteurs de
  // ligne, consommée aussi par ListRowSkeletons ». Si la card n'appliquait plus
  // la hauteur de la table, le squelette et la ligne divergeraient à nouveau —
  // exactement le saut de mise en page que `ui.md` interdit.
  it.each(TAILLES)(
    'variante média (%s) : la card porte la hauteur de MEDIA_HEIGHT',
    (size) => {
      const { container } = render(
        <ListRow
          title="Chaufferie"
          media={<div data-testid="vignette" />}
          size={size}
        />,
      )
      expect(card(container).className).toContain(MEDIA_HEIGHT[size])
    },
  )

  // ORACLE : documenté — la vignette « Prime sur `icon` ».
  it('la vignette prime sur l’icône', () => {
    render(
      <ListRow
        title="Chaufferie"
        media={<div data-testid="vignette" />}
        icon={<span data-testid="icone" />}
      />,
    )
    expect(screen.getByTestId('vignette')).toBeInTheDocument()
    expect(screen.queryByTestId('icone')).toBeNull()
  })

  // ORACLE : documenté — variante média, « ligne de description TOUJOURS
  // présente (espace insécable si vide) → titre et description à position
  // STABLE ». La hauteur de la card ne doit pas dépendre de la présence du
  // sous-titre.
  it('variante média sans sous-titre : la ligne de description existe quand même', () => {
    const { container } = render(
      <ListRow title="Chaufferie" media={<div data-testid="vignette" />} />,
    )
    const lignes = container.querySelectorAll('div.truncate')
    // Titre + ligne de description réservée.
    expect(lignes.length).toBeGreaterThanOrEqual(2)
  })

  // ORACLE : variante STANDARD — le sous-titre n'est rendu que s'il est fourni
  // (la hauteur y suit le contenu, cf. ROW_PADDING).
  it('variante standard : le sous-titre fourni est affiché', () => {
    render(<ListRow title="Chaufferie" subtitle="Sous-sol, local technique" />)
    expect(screen.getByText('Sous-sol, local technique')).toBeInTheDocument()
  })

  // ORACLE : `tone` est OPT-IN — « sans ce prop, aucun liseré ».
  it('sans `tone` : aucun liseré d’accent', () => {
    const { container } = render(<ListRow title="Chaufferie" />)
    expect(card(container).className).not.toContain('border-l-4')
  })

  // ORACLE : avec `tone`, « un liseré coloré au bord gauche ».
  it('avec `tone` : liseré d’accent au bord gauche', () => {
    const { container } = render(<ListRow title="Chaufferie" tone="warning" />)
    expect(card(container).className).toContain('border-l-4')
  })
})

describe('ListRow — fuzzing du contenu', () => {
  // ORACLE (sécurité d'affichage) : titres, sous-titres et badges viennent des
  // DONNÉES (saisie utilisateur, import CSV). Ils doivent rendre sans jeter et
  // rester du TEXTE — jamais du balisage interprété.
  it('titre / sous-titre / badge hostiles : rendu sans exception et sans balisage', () => {
    fc.assert(
      fc.property(
        texteHostileArb,
        texteHostileArb,
        texteHostileArb,
        (titre, sousTitre, badge) => {
          const { container, unmount } = render(
            <ListRow
              title={titre}
              subtitle={sousTitre}
              badges={badge}
              onClick={() => undefined}
            />,
          )
          try {
            expect(container.querySelector('script')).toBeNull()
            expect(container.querySelector('img')).toBeNull()
            expect(container.querySelector('b')).toBeNull()
            if (titre.trim() !== '') {
              expect(container.textContent).toContain(titre)
            }
          } finally {
            unmount()
          }
        },
      ),
      TIRAGES,
    )
  })

  // ORACLE : le nom accessible de la ligne cliquable est le titre — y compris
  // quand celui-ci est vide. Une ligne cliquable SANS nom accessible est une
  // cible anonyme au lecteur d'écran : on veut savoir si le cas se produit.
  it('titre vide : la ligne cliquable garde-t-elle un nom accessible ?', () => {
    render(<ListRow title="" onClick={() => undefined} />)
    const boutons = screen.getAllByRole('button')
    expect(boutons).toHaveLength(1)
    expect(boutons[0]?.getAttribute('aria-labelledby')).not.toBeNull()
  })
})
