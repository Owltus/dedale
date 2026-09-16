import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import { SearchInput } from './search-input'
import { ListFilterBar, statutFilterOptions } from './list-filter-bar'
import { StatusBadge, toneBadgeClasses, type StatusTone } from './status-badge'
import { ProgressBar } from './progress-bar'
import { StatusStepper, type StepperStep } from './status-stepper'
import { TIRAGES, texteHostileArb } from '@/test/harness'

/**
 * Briques de LISTE : barre de recherche, barre de filtre, badges de statut,
 * barre de progression, frise d'avancement. Elles n'ont aucune logique métier :
 * ce qu'on teste, ce sont leurs promesses d'interface et d'accessibilité.
 */

/** Les sept tonalités du système d'état (cf. `StatusTone`). */
const TONALITES: StatusTone[] = [
  'neutral',
  'success',
  'warning',
  'destructive',
  'info',
  'violet',
  'yellow',
]

describe('SearchInput', () => {
  // ORACLE : documenté — « Nom accessible (défaut : le placeholder) ». Un champ
  // de recherche sans nom accessible est un champ anonyme au lecteur d'écran.
  it('prend le placeholder comme nom accessible par défaut', () => {
    render(<SearchInput value="" onChange={() => undefined} />)
    expect(screen.getByLabelText('Rechercher…')).toBeInTheDocument()
  })

  // ORACLE : `ariaLabel` surcharge le nom accessible.
  it('ariaLabel surcharge le nom accessible', () => {
    render(
      <SearchInput
        value=""
        onChange={() => undefined}
        placeholder="Rechercher un équipement…"
        ariaLabel="Recherche dans le parc"
      />,
    )
    expect(screen.getByLabelText('Recherche dans le parc')).toBeInTheDocument()
  })

  // ORACLE : aller-retour — ce que l'utilisateur tape doit ressortir INCHANGÉ
  // par `onChange` (le champ est contrôlé : il ne transforme rien).
  it('la saisie ressort inchangée (aller-retour)', async () => {
    const utilisateur = userEvent.setup()
    function Hote() {
      const [v, setV] = useState('')
      return (
        <>
          <SearchInput value={v} onChange={setV} />
          <output>{v}</output>
        </>
      )
    }
    render(<Hote />)

    const champ = screen.getByLabelText('Rechercher…')
    await utilisateur.type(champ, 'Chaufferie N°2')
    expect(champ).toHaveValue('Chaufferie N°2')
    expect(screen.getByRole('status')).toHaveTextContent('Chaufferie N°2')
  })

  // ORACLE : documenté — l'icône loupe est « non cliquable » ; le seul élément
  // interactif du composant est le champ lui-même.
  it('n’expose qu’un seul contrôle : le champ', () => {
    render(<SearchInput value="" onChange={() => undefined} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('ListFilterBar', () => {
  const statuts = [
    { id: 1, nom: 'Ouvert' },
    { id: 2, nom: 'En cours' },
    { id: 3, nom: 'Clôturé' },
  ]

  // ORACLE : documenté — « Omis → barre de recherche SEULE ». Un filtre non
  // demandé ne doit pas apparaître.
  it('sans options : aucun filtre, seulement la recherche', () => {
    render(<ListFilterBar search="" onSearchChange={() => undefined} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  // ORACLE : le filtre exige options NON VIDES + état contrôlé. Une liste
  // d'options vide n'a rien à proposer.
  it('options vides : aucun filtre', () => {
    render(
      <ListFilterBar
        search=""
        onSearchChange={() => undefined}
        options={[]}
        filterValue="all"
        onFilterChange={() => undefined}
      />,
    )
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  // ORACLE : le filtre n'est branché que si la page fournit AUSSI l'état
  // contrôlé — sinon il serait figé.
  it('options sans état contrôlé : aucun filtre', () => {
    render(
      <ListFilterBar
        search=""
        onSearchChange={() => undefined}
        options={statutFilterOptions(statuts)}
      />,
    )
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  // ORACLE : documenté — « Nom accessible du filtre (défaut « Filtrer ») ».
  it('le filtre porte un nom accessible par défaut', () => {
    render(
      <ListFilterBar
        search=""
        onSearchChange={() => undefined}
        options={statutFilterOptions(statuts)}
        filterValue="actifs"
        onFilterChange={() => undefined}
      />,
    )
    expect(
      screen.getByRole('combobox', { name: 'Filtrer' }),
    ).toBeInTheDocument()
  })

  // ORACLE : choisir une option notifie la page UNE fois, avec la valeur de
  // l'option choisie (la page applique elle-même le filtrage).
  it('choisir un statut appelle onFilterChange une fois avec son id', async () => {
    const utilisateur = userEvent.setup()
    const onFilterChange = vi.fn()
    render(
      <ListFilterBar
        search=""
        onSearchChange={() => undefined}
        options={statutFilterOptions(statuts)}
        filterValue="actifs"
        onFilterChange={onFilterChange}
      />,
    )

    await utilisateur.click(screen.getByRole('combobox', { name: 'Filtrer' }))
    await utilisateur.click(
      await screen.findByRole('option', { name: 'Clôturé' }),
    )

    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(onFilterChange).toHaveBeenCalledWith('3')
  })

  // ORACLE : la recherche de la barre est la même brique que `SearchInput` —
  // son placeholder est transmis, donc son nom accessible aussi.
  it('transmet le placeholder de recherche', () => {
    render(
      <ListFilterBar
        search=""
        onSearchChange={() => undefined}
        searchPlaceholder="Rechercher un ordre de travail…"
      />,
    )
    expect(
      screen.getByLabelText('Rechercher un ordre de travail…'),
    ).toBeInTheDocument()
  })
})

describe('StatusBadge', () => {
  // ORACLE : documenté — `toneBadgeClasses` existe pour « habiller un AUTRE
  // déclencheur avec le MÊME code couleur que StatusBadge, sans dupliquer
  // TONE_CLASSES ». Les deux doivent donc rester d'accord : si le badge
  // n'appliquait plus ce que l'helper renvoie, le code couleur divergerait
  // entre le badge et le sélecteur de transition.
  it.each(TONALITES)(
    'tonalité %s : le badge applique exactement les classes de toneBadgeClasses',
    (tone) => {
      render(<StatusBadge tone={tone}>Ouvert</StatusBadge>)
      const badge = screen.getByText('Ouvert')
      for (const classe of toneBadgeClasses(tone).split(' ')) {
        expect(badge.className).toContain(classe)
      }
    },
  )

  // ORACLE : le badge est une mise en forme — son contenu reste du TEXTE.
  it('fuzzing : le libellé reste du texte, jamais du balisage', () => {
    fc.assert(
      fc.property(texteHostileArb, (libelle) => {
        const { container, unmount } = render(
          <StatusBadge tone="info">{libelle}</StatusBadge>,
        )
        try {
          expect(container.querySelector('script')).toBeNull()
          expect(container.querySelector('b')).toBeNull()
          expect(container.textContent).toBe(libelle)
        } finally {
          unmount()
        }
      }),
      TIRAGES,
    )
  })
})

describe('ProgressBar', () => {
  // ORACLE : documenté — « Accessible (role="progressbar") », avec les bornes.
  it('expose un role progressbar borné à 0..100', () => {
    render(<ProgressBar value={0.42} label="Avancement du contrat" />)
    const barre = screen.getByRole('progressbar', {
      name: 'Avancement du contrat',
    })
    expect(barre).toHaveAttribute('aria-valuemin', '0')
    expect(barre).toHaveAttribute('aria-valuemax', '100')
    expect(barre).toHaveAttribute('aria-valuenow', '42')
  })

  // ORACLE : documenté — « `value` est borné à [0..1] ». Une valeur hors
  // bornes (calcul métier qui déborde) ne doit jamais produire un
  // `aria-valuenow` hors de 0..100, que l'ARIA rendrait invalide.
  it('fuzzing : aria-valuenow reste un entier de 0 à 100 pour toute valeur finie', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -1e6,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (valeur) => {
          const { unmount } = render(<ProgressBar value={valeur} label="x" />)
          try {
            const now = screen
              .getByRole('progressbar')
              .getAttribute('aria-valuenow')
            expect(now).not.toBeNull()
            const n = Number(now)
            expect(Number.isInteger(n)).toBe(true)
            expect(n).toBeGreaterThanOrEqual(0)
            expect(n).toBeLessThanOrEqual(100)
          } finally {
            unmount()
          }
        },
      ),
      TIRAGES,
    )
  })

  // ORACLE : `aria-valuenow` doit être un NOMBRE (WAI-ARIA `valuetype: number`),
  // et le composant promet que « `value` est borné à [0..1] ». Un ratio
  // « fait / total » vaut `NaN` dès que le total est nul ou qu'une date est
  // illisible — `progressionContrat` (features/prestataires/etat.ts) renvoie
  // alors `NaN`, qui passe son garde `progression != null` et arrive ici.
  //
  // Régression couverte : `Math.round(Math.min(1, Math.max(0, NaN)) * 100)`
  // vaut `NaN` — le bornage à [0..1] ne rattrape pas ce qui n'est pas un
  // nombre. La barre rendait alors `aria-valuenow="NaN"` et
  // `style="width: NaN%"`. Le contrat de la brique vaut désormais aussi pour
  // `NaN` et les infinis.
  it('valeur NaN (0/0) : aria-valuenow reste un nombre valide', () => {
    render(<ProgressBar value={0 / 0} label="Avancement" />)
    const now = screen.getByRole('progressbar').getAttribute('aria-valuenow')
    expect(Number.isNaN(Number(now))).toBe(false)
  })

  // ORACLE : sans `label`, pas de nom accessible inventé — mais le rôle reste.
  it('sans label : le rôle progressbar est tout de même exposé', () => {
    render(<ProgressBar value={0.5} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})

describe('StatusStepper', () => {
  const etapes: StepperStep[] = [
    { label: 'Ouvert', state: 'done' },
    { label: 'En cours', state: 'current' },
    { label: 'Clôturé', state: 'upcoming' },
  ]

  // ORACLE : documenté — la frise est une `<ol aria-label="Avancement">`.
  it('rend une liste ordonnée nommée « Avancement »', () => {
    render(<StatusStepper steps={etapes} />)
    expect(screen.getByRole('list', { name: 'Avancement' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  // ORACLE : documenté — « aria-current sur l'étape en cours ».
  it('marque l’étape en cours avec aria-current="step"', () => {
    render(<StatusStepper steps={etapes} />)
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[2]).not.toHaveAttribute('aria-current')
  })

  // ORACLE : documenté — « texte d'état sr-only : l'info ne passe pas QUE par
  // la couleur/l'icône » (WCAG 1.4.1).
  it('chaque étape porte son état en texte, pas seulement en couleur', () => {
    render(
      <StatusStepper
        steps={[...etapes, { label: 'Refusé', state: 'rejected' }]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]!).getByText('franchi')).toBeTruthy()
    expect(within(items[1]!).getByText('en cours')).toBeTruthy()
    expect(within(items[2]!).getByText('à venir')).toBeTruthy()
    expect(within(items[3]!).getByText('refusé')).toBeTruthy()
  })

  // ORACLE : documenté — sans `onStepClick`, « la pastille reste un simple
  // indicateur » (pas de faux bouton).
  it('sans onStepClick : aucune pastille cliquable', () => {
    render(
      <StatusStepper steps={etapes.map((e) => ({ ...e, actionable: true }))} />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ORACLE : documenté — seules les étapes `actionable` deviennent des boutons,
  // nommés « Passer à « X » ».
  it('seules les étapes actionnables sont des boutons nommés', () => {
    render(
      <StatusStepper
        steps={[
          { label: 'Ouvert', state: 'done' },
          { label: 'En cours', state: 'current', actionable: true },
          { label: 'Clôturé', state: 'upcoming' },
        ]}
        onStepClick={() => undefined}
      />,
    )
    const boutons = screen.getAllByRole('button')
    expect(boutons).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Passer à « En cours »' }),
    ).toBeInTheDocument()
  })

  // ORACLE : le clic passe l'INDEX de l'étape, une seule fois.
  it('cliquer une pastille appelle onStepClick une fois avec son index', async () => {
    const utilisateur = userEvent.setup()
    const onStepClick = vi.fn()
    render(
      <StatusStepper
        steps={[
          { label: 'Ouvert', state: 'done' },
          { label: 'En cours', state: 'current' },
          { label: 'Clôturé', state: 'upcoming', actionable: true },
        ]}
        onStepClick={onStepClick}
      />,
    )

    await utilisateur.click(
      screen.getByRole('button', { name: 'Passer à « Clôturé »' }),
    )
    expect(onStepClick).toHaveBeenCalledTimes(1)
    expect(onStepClick).toHaveBeenCalledWith(2)
  })

  // ORACLE : documenté — `disabled` « désactive temporairement tous les clics
  // (ex. mutation en cours) ». Une transition ne doit pas pouvoir partir deux
  // fois pendant l'envoi.
  it('disabled : la pastille est désactivée et ne déclenche rien', async () => {
    const utilisateur = userEvent.setup()
    const onStepClick = vi.fn()
    render(
      <StatusStepper
        steps={[{ label: 'Clôturé', state: 'upcoming', actionable: true }]}
        onStepClick={onStepClick}
        disabled
      />,
    )

    const bouton = screen.getByRole('button', { name: 'Passer à « Clôturé »' })
    expect(bouton).toBeDisabled()
    await utilisateur.click(bouton)
    expect(onStepClick).not.toHaveBeenCalled()
  })

  // ORACLE : les étapes non franchies sont NUMÉROTÉES (1-based) — c'est ce qui
  // dit à l'utilisateur où il en est dans le cycle.
  it('les étapes à venir affichent leur rang (1-based)', () => {
    render(
      <StatusStepper
        steps={[
          { label: 'Un', state: 'upcoming' },
          { label: 'Deux', state: 'upcoming' },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]?.textContent).toContain('1')
    expect(items[1]?.textContent).toContain('2')
  })

  // ORACLE : documenté — la frise « tolère les libellés longs (troncature) ».
  // Elle vient de données métier : elle doit rendre sans jeter, en texte.
  it('fuzzing : libellés hostiles rendus sans exception et sans balisage', () => {
    fc.assert(
      fc.property(fc.array(texteHostileArb, { maxLength: 6 }), (libelles) => {
        const steps: StepperStep[] = libelles.map((label, i) => ({
          label,
          state: i === 0 ? 'done' : 'upcoming',
        }))
        const { container, unmount } = render(<StatusStepper steps={steps} />)
        try {
          expect(container.querySelector('script')).toBeNull()
          expect(container.querySelector('b')).toBeNull()
        } finally {
          unmount()
        }
      }),
      TIRAGES,
    )
  })
})
