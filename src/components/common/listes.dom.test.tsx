import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import { SearchInput } from './search-input'
import { ListFilterBar, statutFilterOptions } from './list-filter-bar'
import { StatusBadge, toneBadgeClasses, type StatusTone } from './status-badge'
import { ProgressBar } from './progress-bar'
import { TIRAGES, texteHostileArb } from '@/test/harness'

/**
 * Briques de LISTE : barre de recherche, barre de filtre, badges de statut,
 * barre de progression. Elles n'ont aucune logique métier :
 * ce qu'on teste, ce sont leurs promesses d'interface et d'accessibilité.
 */

/** Les neuf tonalités du système d'état (cf. `StatusTone`). */
const TONALITES: StatusTone[] = [
  'neutral',
  'success',
  'warning',
  'destructive',
  'info',
  'violet',
  'yellow',
  'orange',
  'rose',
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

  // ORACLE : un filtre additionnel (ex. nature d'un OT) s'affiche après le
  // filtre principal, avec SON nom accessible, et notifie SON propre état.
  it('filtre supplémentaire : affiché à part et notifié avec sa valeur', async () => {
    const utilisateur = userEvent.setup()
    const onStatut = vi.fn()
    const onNature = vi.fn()
    render(
      <ListFilterBar
        search=""
        onSearchChange={() => undefined}
        options={statutFilterOptions(statuts)}
        filterValue="actifs"
        onFilterChange={onStatut}
        filterLabel="Filtrer par statut"
        filtresSupplementaires={[
          {
            value: 'all',
            onChange: onNature,
            options: [
              { value: 'all', label: 'Toutes les natures' },
              { value: 'controle_interne', label: 'Contrôle interne' },
            ],
            label: 'Filtrer par nature',
          },
        ]}
      />,
    )

    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    await utilisateur.click(
      screen.getByRole('combobox', { name: 'Filtrer par nature' }),
    )
    await utilisateur.click(
      await screen.findByRole('option', { name: 'Contrôle interne' }),
    )

    expect(onNature).toHaveBeenCalledWith('controle_interne')
    expect(onStatut).not.toHaveBeenCalled()
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
