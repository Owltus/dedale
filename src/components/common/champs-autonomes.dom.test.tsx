import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import { ChampValeurInput } from './champ-valeur-input'
import { OptionsEditor } from './options-editor'
import { CheckboxList } from './checkbox-list'
import {
  StandaloneCheckbox,
  StandaloneSelect,
  StandaloneText,
} from './standalone-fields'
import type { Champ, ChampType, ChampValeur } from '@/lib/champs'
import { TIRAGES, texteHostileArb } from '@/test/harness'

/**
 * Champs AUTONOMES (`value` / `onChange`, état chez l'hôte) : c'est par eux que
 * passent les caractéristiques libres, dont le type n'est connu qu'à
 * l'exécution. Deux promesses : la valeur saisie ressort INCHANGÉE, et un type
 * inattendu ne fait pas tomber l'écran.
 */

/** Fabrique un champ typé complet (le schéma exige `cle`, `type`, `requis`, `defaut`). */
function champ(partiel: Partial<Champ> & { type: ChampType }): Champ {
  return {
    cle: 'Puissance',
    requis: false,
    defaut: null,
    ...partiel,
  }
}

/** Hôte contrôlé : rend le champ et expose la dernière valeur reçue. */
function HoteChamp({
  definition,
  initial = null,
  onChange,
  error,
}: {
  definition: Champ
  initial?: ChampValeur
  onChange?: (v: ChampValeur) => void
  error?: string
}) {
  const [valeur, setValeur] = useState<ChampValeur>(initial)
  return (
    <ChampValeurInput
      champ={definition}
      value={valeur}
      error={error}
      onChange={(v) => {
        setValeur(v)
        onChange?.(v)
      }}
    />
  )
}

describe('ChampValeurInput — libellé et accessibilité', () => {
  // ORACLE : documenté dans le composant — « Le libellé = `champ.cle` », et
  // l'enveloppe est le « gabarit commun aux CINQ types ». Sans libellé VISIBLE,
  // une caractéristique dans une liste de caractéristiques n'est plus
  // identifiable à l'écran.
  it.each<ChampType>(['texte', 'nombre', 'oui-non', 'liste'])(
    'type %s : le nom du champ est affiché comme libellé',
    (type) => {
      render(
        <HoteChamp
          definition={champ({ type, cle: 'Puissance', options: ['A', 'B'] })}
        />,
      )
      expect(screen.getByText('Puissance')).toBeVisible()
    },
  )

  // ORACLE : même règle pour le cinquième type.
  //
  // RÉGRESSION COUVERTE : la branche `case 'date'` rendait le `DateField` SANS
  // passer par `Enveloppe`. Le nom du champ n'existait alors que dans
  // l'`ariaLabel` : dans une fiche qui liste plusieurs caractéristiques,
  // l'utilisateur voyant voyait des sélecteurs de date anonymes les uns sous
  // les autres — et basculer une caractéristique sur « Date » dans un gabarit
  // faisait disparaître son libellé sous ses yeux.
  it('type date : le nom du champ est affiché comme libellé', () => {
    render(<HoteChamp definition={champ({ type: 'date', cle: 'Puissance' })} />)
    expect(screen.getByText('Puissance')).toBeVisible()
  })

  // ORACLE : accessibilité — le `<label for>` doit désigner un élément qui
  // EXISTE, sinon cliquer le libellé ne focalise rien. Les CINQ types y passent :
  // c'est ce filet générique qui empêchera le sixième de naître sans libellé.
  it.each<ChampType>(['texte', 'nombre', 'date', 'oui-non', 'liste'])(
    'type %s : le libellé désigne un élément existant',
    (type) => {
      const { container } = render(
        <HoteChamp
          definition={champ({ type, cle: 'Puissance', options: ['A', 'B'] })}
        />,
      )
      const label = container.querySelector('label')
      expect(label).not.toBeNull()
      expect(label?.htmlFor).not.toBe('')
      expect(document.getElementById(label?.htmlFor ?? '')).not.toBeNull()
    },
  )

  // ORACLE : documenté — l'enveloppe rend « libellé + widget + message
  // d'erreur ». Une erreur de validation doit être VUE, quel que soit le type.
  it.each<ChampType>(['texte', 'nombre', 'oui-non', 'liste'])(
    'type %s : le message d’erreur est affiché',
    (type) => {
      render(
        <HoteChamp
          definition={champ({ type, options: ['A', 'B'] })}
          error="Valeur obligatoire."
        />,
      )
      expect(screen.getByText('Valeur obligatoire.')).toBeVisible()
    },
  )

  // RÉGRESSION COUVERTE : la branche `case 'date'`, hors `Enveloppe`, ignorait
  // complètement la prop `error` — une date invalide ou manquante était refusée
  // en silence, sans un mot à l'écran.
  it('type date : le message d’erreur est affiché', () => {
    render(
      <HoteChamp
        definition={champ({ type: 'date' })}
        error="Valeur obligatoire."
      />,
    )
    expect(screen.getByText('Valeur obligatoire.')).toBeVisible()
  })

  // ORACLE : documenté — un champ requis est marqué d'une astérisque.
  it('champ requis : le libellé porte l’astérisque', () => {
    render(<HoteChamp definition={champ({ type: 'texte', requis: true })} />)
    expect(screen.getByText('Puissance *')).toBeVisible()
  })
})

describe('ChampValeurInput — aller-retour des valeurs', () => {
  // ORACLE : la valeur saisie ressort INCHANGÉE par `onChange` (le champ ne
  // transforme pas le texte). Ce qu'on tape est ce qui sera écrit en base.
  it('texte : la saisie ressort inchangée', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteChamp
        definition={champ({ type: 'texte', cle: 'Marque' })}
        onChange={onChange}
      />,
    )

    const saisie = 'Atlas Copco — GA 11'
    await utilisateur.type(screen.getByLabelText('Marque'), saisie)
    expect(screen.getByLabelText('Marque')).toHaveValue(saisie)
    expect(onChange).toHaveBeenLastCalledWith(saisie)
  })

  // ORACLE : documenté par le code — un texte effacé vaut `null` (absence),
  // pas la chaîne vide : c'est ce que le JSONB doit contenir.
  it('texte effacé : la valeur devient null', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteChamp
        definition={champ({ type: 'texte', cle: 'Marque' })}
        initial="Atlas"
        onChange={onChange}
      />,
    )

    await utilisateur.clear(screen.getByLabelText('Marque'))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  // ORACLE : un champ « nombre » produit un NOMBRE, pas une chaîne — sinon la
  // valeur stockée change de type selon l'écran qui l'a saisie.
  it('nombre : la valeur ressort en number', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteChamp
        definition={champ({ type: 'nombre', cle: 'Puissance', unite: 'kW' })}
        onChange={onChange}
      />,
    )

    await utilisateur.type(screen.getByLabelText('Puissance'), '12.5')
    expect(onChange).toHaveBeenLastCalledWith(12.5)
    // L'unité est affichée à côté du champ.
    expect(screen.getByText('kW')).toBeVisible()
  })

  // ORACLE : un nombre effacé vaut `null` (et non `0`, ni `NaN`).
  it('nombre effacé : la valeur devient null', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteChamp
        definition={champ({ type: 'nombre', cle: 'Puissance' })}
        initial={12}
        onChange={onChange}
      />,
    )

    await utilisateur.clear(screen.getByLabelText('Puissance'))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  // ORACLE : un « oui-non » produit un BOOLÉEN, et la case est pilotée par la
  // valeur (aller-retour complet).
  it('oui-non : cocher produit true, décocher produit false', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteChamp
        definition={champ({ type: 'oui-non', cle: 'Sous contrat' })}
        onChange={onChange}
      />,
    )

    const case_ = screen.getByRole('checkbox', { name: 'Sous contrat' })
    await utilisateur.click(case_)
    expect(onChange).toHaveBeenLastCalledWith(true)
    expect(case_).toBeChecked()

    await utilisateur.click(case_)
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(case_).not.toBeChecked()
  })

  // ORACLE : une liste produit EXACTEMENT l'option choisie.
  it('liste : l’option choisie ressort inchangée', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteChamp
        definition={champ({
          type: 'liste',
          cle: 'Énergie',
          requis: true,
          options: ['Gaz', 'Électricité', 'Fioul'],
        })}
        onChange={onChange}
      />,
    )

    await utilisateur.click(screen.getByRole('combobox', { name: 'Énergie' }))
    await utilisateur.click(
      await screen.findByRole('option', { name: 'Électricité' }),
    )
    expect(onChange).toHaveBeenLastCalledWith('Électricité')
  })

  // ORACLE : documenté — « Champ FACULTATIF → option neutre réellement
  // SÉLECTIONNABLE : une valeur choisie par erreur doit pouvoir être retirée ».
  it('liste facultative : l’option neutre est proposée et remet la valeur à null', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteChamp
        definition={champ({
          type: 'liste',
          cle: 'Énergie',
          requis: false,
          options: ['Gaz', 'Fioul'],
        })}
        initial="Gaz"
        onChange={onChange}
      />,
    )

    await utilisateur.click(screen.getByRole('combobox', { name: 'Énergie' }))
    await utilisateur.click(
      await screen.findByRole('option', { name: '— Aucun —' }),
    )
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  // ORACLE : documenté — une liste REQUISE ne propose PAS l'option neutre.
  it('liste requise : pas d’option neutre', async () => {
    const utilisateur = userEvent.setup()
    render(
      <HoteChamp
        definition={champ({
          type: 'liste',
          cle: 'Énergie',
          requis: true,
          options: ['Gaz', 'Fioul'],
        })}
      />,
    )

    await utilisateur.click(screen.getByRole('combobox', { name: 'Énergie' }))
    expect(await screen.findByRole('option', { name: 'Gaz' })).toBeVisible()
    expect(screen.queryByRole('option', { name: '— Aucun —' })).toBeNull()
  })

  // ORACLE : le type d'un champ vient du JSONB `specifications`, c'est-à-dire
  // de la BASE. `parseChamps` « ne jette jamais » ; l'écran non plus : un type
  // inconnu (champ legacy, gabarit modifié) doit retomber sur la saisie texte,
  // pas faire tomber la page.
  it('type inconnu : repli sur la saisie texte, sans exception', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    const inconnu = {
      cle: 'Mystère',
      type: 'couleur-arc-en-ciel',
      requis: false,
      defaut: null,
    } as unknown as Champ

    expect(() => {
      render(<HoteChamp definition={inconnu} onChange={onChange} />)
    }).not.toThrow()

    const saisie = screen.getByLabelText('Mystère')
    await utilisateur.type(saisie, 'bleu')
    expect(onChange).toHaveBeenLastCalledWith('bleu')
  })

  // ORACLE : le NOM du champ vient des données (gabarit saisi par un admin,
  // import CSV) — il doit rester du texte et ne jamais empêcher le rendu.
  it('fuzzing : un nom de champ hostile ne casse pas le rendu', () => {
    fc.assert(
      fc.property(texteHostileArb, (cle) => {
        const { container, unmount } = render(
          <HoteChamp definition={champ({ type: 'texte', cle })} />,
        )
        try {
          expect(container.querySelector('script')).toBeNull()
          expect(container.querySelector('b')).toBeNull()
          expect(container.querySelector('input')).not.toBeNull()
        } finally {
          unmount()
        }
      }),
      TIRAGES,
    )
  })
})

describe('OptionsEditor', () => {
  /** Hôte contrôlé : l'éditeur ne porte pas son état. */
  function HoteOptions({
    initial,
    onChange,
  }: {
    initial: string[]
    onChange?: (o: string[]) => void
  }) {
    const [options, setOptions] = useState(initial)
    return (
      <OptionsEditor
        value={options}
        onChange={(o) => {
          setOptions(o)
          onChange?.(o)
        }}
      />
    )
  }

  // ORACLE : chaque option est un champ NOMMÉ (« Option 1 », « Option 2 »…) —
  // sans quoi trois champs texte identiques sont indiscernables au clavier.
  it('nomme chaque option par son rang (1-based)', () => {
    render(<HoteOptions initial={['Gaz', 'Fioul']} />)
    expect(screen.getByLabelText('Option 1')).toHaveValue('Gaz')
    expect(screen.getByLabelText('Option 2')).toHaveValue('Fioul')
  })

  // ORACLE : aller-retour — modifier une option ne modifie QUE celle-là.
  it('modifier une option laisse les autres intactes', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(<HoteOptions initial={['Gaz', 'Fioul']} onChange={onChange} />)

    await utilisateur.type(screen.getByLabelText('Option 2'), 'l')
    expect(onChange).toHaveBeenLastCalledWith(['Gaz', 'Fioull'])
  })

  // ORACLE : « Ajouter une option » ajoute UNE entrée vide à la fin.
  it('ajoute une option vide en fin de liste', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(<HoteOptions initial={['Gaz']} onChange={onChange} />)

    await utilisateur.click(
      screen.getByRole('button', { name: 'Ajouter une option' }),
    )
    expect(onChange).toHaveBeenLastCalledWith(['Gaz', ''])
    expect(screen.getByLabelText('Option 2')).toHaveValue('')
  })

  // ORACLE : retirer l'option i retire EXACTEMENT celle-là (et pas la dernière).
  it('retire exactement l’option visée', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HoteOptions initial={['Gaz', 'Fioul', 'Bois']} onChange={onChange} />,
    )

    const boutons = screen.getAllByRole('button', { name: 'Retirer l’option' })
    await utilisateur.click(boutons[0]!)
    expect(onChange).toHaveBeenLastCalledWith(['Fioul', 'Bois'])
  })

  // ORACLE : liste vide → aucun champ d'option, mais le bouton d'ajout reste.
  it('liste vide : aucun champ, bouton d’ajout présent', () => {
    render(<HoteOptions initial={[]} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Ajouter une option' }),
    ).toBeInTheDocument()
  })

  // ORACLE : aller-retour sur un contenu quelconque — l'éditeur ne nettoie
  // rien (« L'unicité et le nettoyage sont arbitrés à la soumission »).
  it('fuzzing : les valeurs sont rendues telles quelles, sans nettoyage', () => {
    fc.assert(
      fc.property(
        fc.array(texteHostileArb, { minLength: 1, maxLength: 5 }),
        (options) => {
          const { unmount } = render(
            <OptionsEditor value={options} onChange={() => undefined} />,
          )
          try {
            options.forEach((valeur, i) => {
              expect(
                screen.getByLabelText(`Option ${String(i + 1)}`),
              ).toHaveValue(valeur)
            })
          } finally {
            unmount()
          }
        },
      ),
      TIRAGES,
    )
  })
})

describe('CheckboxList', () => {
  // ORACLE : documenté — « Accepte les props d'un div (role, aria-labelledby…) :
  // sans cela, le consommateur qui a besoin d'un attribut recopie les classes à
  // côté » — c'est ainsi que les trois hauteurs avaient divergé.
  it('transmet les attributs ARIA au conteneur', () => {
    render(
      <CheckboxList role="group" aria-label="Sites accessibles">
        <label>
          <input type="checkbox" /> Siège
        </label>
      </CheckboxList>,
    )
    expect(
      screen.getByRole('group', { name: 'Sites accessibles' }),
    ).toBeInTheDocument()
  })

  // ORACLE : documenté — la brique PORTE la hauteur maximale (`max-h-72`), au
  // lieu de la laisser diverger chez chaque appelant.
  it('porte elle-même la hauteur maximale de la zone défilante', () => {
    const { container } = render(
      <CheckboxList>
        <span>x</span>
      </CheckboxList>,
    )
    expect(container.firstElementChild?.className).toContain('max-h-72')
  })

  // ORACLE : `bordered` est OPT-IN — sans lui, la liste se fond dans son
  // conteneur.
  it('sans `bordered` : pas de cadre', () => {
    const { container } = render(
      <CheckboxList>
        <span>x</span>
      </CheckboxList>,
    )
    expect(container.firstElementChild?.className).not.toContain('border')
  })

  it('avec `bordered` : cadre appliqué', () => {
    const { container } = render(
      <CheckboxList bordered>
        <span>x</span>
      </CheckboxList>,
    )
    expect(container.firstElementChild?.className).toContain('border')
  })
})

describe('standalone-fields', () => {
  // ORACLE : documenté — « Ces briques portent l'`id` qui relie le
  // `<Label htmlFor>` au champ — ne pas les remplacer par un Label + primitive
  // à la main, c'est ainsi que des libellés ont fini par ne désigner aucun
  // champ » (docs/conventions/composants.md).
  it('StandaloneText : le libellé désigne bien le champ', () => {
    const { container } = render(
      <StandaloneText label="Libellé" value="" onChange={() => undefined} />,
    )
    const label = container.querySelector('label')
    expect(document.getElementById(label?.htmlFor ?? '')).toBe(
      screen.getByLabelText('Libellé'),
    )
  })

  // ORACLE : aller-retour — la saisie ressort inchangée.
  it('StandaloneText : la saisie ressort inchangée', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    function Hote() {
      const [v, setV] = useState('')
      return (
        <StandaloneText
          label="Libellé"
          value={v}
          onChange={(x) => {
            setV(x)
            onChange(x)
          }}
        />
      )
    }
    render(<Hote />)

    await utilisateur.type(screen.getByLabelText('Libellé'), 'Ascenseur n°3')
    expect(screen.getByLabelText('Libellé')).toHaveValue('Ascenseur n°3')
    expect(onChange).toHaveBeenLastCalledWith('Ascenseur n°3')
  })

  // ORACLE : documenté — l'aide est masquée quand une ERREUR est affichée (on
  // ne fait pas cohabiter deux messages sous le même champ).
  it('StandaloneText : l’erreur remplace l’aide', () => {
    const { rerender } = render(
      <StandaloneText
        label="Libellé"
        value=""
        onChange={() => undefined}
        hint="Nom court, visible dans les listes."
      />,
    )
    expect(
      screen.getByText('Nom court, visible dans les listes.'),
    ).toBeVisible()

    rerender(
      <StandaloneText
        label="Libellé"
        value=""
        onChange={() => undefined}
        hint="Nom court, visible dans les listes."
        error="Le libellé est obligatoire."
      />,
    )
    expect(screen.getByText('Le libellé est obligatoire.')).toBeVisible()
    expect(screen.queryByText('Nom court, visible dans les listes.')).toBeNull()
  })

  // ORACLE : documenté — le libellé d'un champ requis porte l'astérisque.
  it('StandaloneText : le champ requis est marqué', () => {
    render(
      <StandaloneText
        label="Libellé"
        value=""
        onChange={() => undefined}
        required
      />,
    )
    expect(screen.getByText('Libellé *')).toBeVisible()
  })

  // ORACLE : documenté — « Ces briques portent l'`id` qui relie le Label au
  // champ » : c'est vrai AUSSI du menu déroulant Radix (`id` sur le
  // déclencheur), sans quoi cliquer le libellé ne focalise pas le menu.
  it('StandaloneSelect : le libellé désigne le déclencheur du menu', () => {
    const { container } = render(
      <StandaloneSelect
        label="Type de local"
        value=""
        onChange={() => undefined}
        options={[{ value: '1', label: 'Bureau' }]}
      />,
    )
    const label = container.querySelector('label')
    expect(document.getElementById(label?.htmlFor ?? '')).toBe(
      screen.getByRole('combobox'),
    )
  })

  // ORACLE : documenté — « option neutre EN TÊTE dont le choix renvoie `''` ».
  it('StandaloneSelect : l’option neutre renvoie une chaîne vide', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <StandaloneSelect
        label="Type de local"
        value="1"
        onChange={onChange}
        optionAucune="— Aucun —"
        options={[{ value: '1', label: 'Bureau' }]}
      />,
    )

    await utilisateur.click(screen.getByRole('combobox'))
    await utilisateur.click(
      await screen.findByRole('option', { name: '— Aucun —' }),
    )
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('')
  })

  // ORACLE : aller-retour — l'option choisie ressort telle quelle.
  it('StandaloneSelect : l’option choisie ressort inchangée', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <StandaloneSelect
        label="Type de local"
        value=""
        onChange={onChange}
        options={[
          { value: '1', label: 'Bureau' },
          { value: '2', label: 'Chaufferie' },
        ]}
      />,
    )

    await utilisateur.click(screen.getByRole('combobox'))
    await utilisateur.click(
      await screen.findByRole('option', { name: 'Chaufferie' }),
    )
    expect(onChange).toHaveBeenCalledWith('2')
  })

  // ORACLE : documenté — « libellé À DROITE, lié via `htmlFor` » : cliquer le
  // libellé doit cocher la case.
  it('StandaloneCheckbox : cliquer le libellé bascule la case', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    function Hote() {
      const [v, setV] = useState(false)
      return (
        <StandaloneCheckbox
          label="Compte actif"
          value={v}
          onChange={(x) => {
            setV(x)
            onChange(x)
          }}
        />
      )
    }
    render(<Hote />)

    await utilisateur.click(screen.getByText('Compte actif'))
    expect(onChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('checkbox', { name: 'Compte actif' })).toBeChecked()
  })

  // ORACLE : `disabled` empêche toute modification.
  it('StandaloneCheckbox : désactivée, la case ne bascule pas', async () => {
    const utilisateur = userEvent.setup()
    const onChange = vi.fn()
    render(
      <StandaloneCheckbox
        label="Compte actif"
        value={false}
        onChange={onChange}
        disabled
      />,
    )

    const case_ = screen.getByRole('checkbox', { name: 'Compte actif' })
    expect(case_).toBeDisabled()
    await utilisateur.click(case_)
    expect(onChange).not.toHaveBeenCalled()
  })
})
