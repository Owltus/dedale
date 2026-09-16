import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import type { Control, FieldValues } from 'react-hook-form'
import { TextField } from './fields/text-field'
import { NumberField } from './fields/number-field'
import { TextareaField } from './fields/textarea-field'
import { DescriptionField } from './fields/description-field'
import { CheckboxField } from './fields/checkbox-field'
import { SwitchField } from './fields/switch-field'
import { RadioField } from './fields/radio-field'
import { SelectField } from './fields/select-field'
import { DateField } from './fields/date-field'
import { FormulaireTest } from '@/test/harness'

/**
 * Champs de `common/fields/` — la famille react-hook-form (`control` + `name`).
 * Ce qu'on vérifie : le libellé DÉSIGNE le champ (accessibilité), et ce que
 * l'utilisateur saisit atterrit tel quel dans le formulaire (aller-retour).
 */

interface Valeurs extends FieldValues {
  nom: string
  puissance: number | null
  notes: string
  description: string
  actif: boolean
  notifications: boolean
  portee: string
  statut: string
  date_prevue: string
}

const DEFAUTS: Valeurs = {
  nom: '',
  puissance: null,
  notes: '',
  description: '',
  actif: false,
  notifications: false,
  portee: 'site',
  statut: '',
  date_prevue: '',
}

/**
 * Rend un champ dans un vrai formulaire et publie l'état courant dans un
 * `<output>` : les tests observent donc ce que le FORMULAIRE a enregistré, pas
 * ce que le composant affiche.
 */
function rendreChamp(
  champ: (control: Control<Valeurs, unknown, FieldValues>) => ReactElement,
) {
  return render(
    <FormulaireTest<Valeurs> defaultValues={DEFAUTS}>
      {(form) => (
        <>
          {champ(form.control as Control<Valeurs, unknown, FieldValues>)}
          <output>{JSON.stringify(form.watch())}</output>
        </>
      )}
    </FormulaireTest>,
  )
}

/** Valeur enregistrée dans le formulaire pour `cle`. */
function valeurFormulaire(cle: keyof Valeurs): unknown {
  const brut = screen.getByRole('status').textContent
  return (JSON.parse(brut) as Record<string, unknown>)[cle]
}

/** Le `<label>` d'en-tête du `FormItem` (le premier rendu). */
function labelDuChamp(container: HTMLElement): HTMLLabelElement {
  const label = container.querySelector('label')
  if (label === null) throw new Error('Aucun libellé rendu')
  return label
}

describe('fields/ — le libellé désigne le champ', () => {
  // ORACLE (accessibilité, WCAG 1.3.1 / 3.3.2, et docs/conventions/composants.md :
  // « c'est ainsi que des libellés ont fini par ne désigner aucun champ ») :
  // l'attribut `for` d'un libellé DOIT pointer sur un élément existant, sinon
  // cliquer le libellé ne focalise rien et l'association n'est pas programmatique.
  it.each([
    [
      'TextField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <TextField control={c} name="nom" label="Libellé" />
      ),
    ],
    [
      'NumberField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <NumberField control={c} name="puissance" label="Libellé" />
      ),
    ],
    [
      'TextareaField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <TextareaField control={c} name="notes" label="Libellé" />
      ),
    ],
    [
      'DescriptionField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <DescriptionField control={c} name="description" label="Libellé" />
      ),
    ],
    [
      'CheckboxField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <CheckboxField control={c} name="actif" label="Libellé" />
      ),
    ],
    [
      'SwitchField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <SwitchField control={c} name="notifications" label="Libellé" />
      ),
    ],
    [
      'RadioField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <RadioField
          control={c}
          name="portee"
          label="Libellé"
          options={[{ value: 'site', label: 'Site' }]}
        />
      ),
    ],
  ])(
    '%s : le `for` du libellé pointe sur un élément existant',
    (_nom, champ) => {
      const { container } = rendreChamp(champ)
      const label = labelDuChamp(container)
      expect(label.htmlFor).not.toBe('')
      expect(document.getElementById(label.htmlFor)).not.toBeNull()
    },
  )

  // RÉGRESSION COUVERTE : `SelectField` rend son `FormLabel` (dont le `for`
  // vaut `${id}-form-item`) ; tant qu'il ne passait pas le `SelectDropdown` par
  // `FormControl`, ce `for` ne désignait AUCUN élément et cliquer « Statut » ne
  // focalisait pas le menu. Le pendant autonome, `StandaloneSelect`, pose bien
  // `id={fieldId}` — la doctrine maison existait, seul ce champ-ci s'en écartait.
  // `SelectField` est le champ le plus utilisé de l'app après `TextField`.
  it('SelectField : le `for` du libellé pointe sur un élément existant', () => {
    const { container } = rendreChamp((c) => (
      <SelectField
        control={c}
        name="statut"
        label="Statut"
        options={[{ value: '1', label: 'Ouvert' }]}
      />
    ))
    const label = labelDuChamp(container)
    expect(document.getElementById(label.htmlFor)).not.toBeNull()
  })

  // RÉGRESSION COUVERTE : même défaut, même cause — `fields/date-field.tsx`
  // rendait le `DatePicker` hors de `FormControl`, et la primitive `ui/date-field`
  // n'acceptait même pas d'`id` à poser sur son déclencheur.
  it('DateField : le `for` du libellé pointe sur un élément existant', () => {
    const { container } = rendreChamp((c) => (
      <DateField control={c} name="date_prevue" label="Date prévue" />
    ))
    const label = labelDuChamp(container)
    expect(document.getElementById(label.htmlFor)).not.toBeNull()
  })

  // ORACLE (le geste de l'utilisateur, WCAG 1.3.1 / 3.3.2) : un `for` résolu ne
  // vaut que par ce qu'il permet — CLIQUER LE LIBELLÉ DOIT OUVRIR LE CHAMP. Sur
  // tablette, la cible tactile du libellé est plus large que le champ : sans ce
  // lien, c'est un tap perdu à chaque fois. Test GÉNÉRIQUE : il vaut pour le
  // sixième champ à menu qui naîtra, pas seulement pour ces deux-là.
  it.each([
    [
      'SelectField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <SelectField
          control={c}
          name="statut"
          label="Libellé"
          options={[{ value: '1', label: 'Ouvert' }]}
        />
      ),
      'Ouvert',
    ],
    [
      'DateField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <DateField control={c} name="date_prevue" label="Libellé" />
      ),
      "Aujourd'hui",
    ],
  ])('%s : cliquer le libellé ouvre le champ', async (_nom, champ, revele) => {
    const utilisateur = userEvent.setup()
    const { container } = rendreChamp(champ)

    await utilisateur.click(labelDuChamp(container))
    expect(await screen.findByText(revele)).toBeVisible()
  })

  // ORACLE (WCAG 3.3.1) : un champ en erreur doit l'ANNONCER lui-même
  // (`aria-invalid`) et DÉSIGNER le texte qui l'explique (`aria-describedby` →
  // `FormMessage`). Un message affiché à l'écran mais non rattaché n'est pas lu
  // au focus : l'utilisateur au lecteur d'écran sait qu'il y a une erreur
  // quelque part, jamais laquelle ni sur quel champ.
  it.each([
    [
      'SelectField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <SelectField
          control={c}
          name="statut"
          label="Libellé"
          options={[{ value: '1', label: 'Ouvert' }]}
        />
      ),
      'combobox' as const,
    ],
    [
      'DateField',
      (c: Control<Valeurs, unknown, FieldValues>) => (
        <DateField control={c} name="date_prevue" label="Libellé" />
      ),
      'button' as const,
    ],
  ])(
    '%s : en erreur, le champ est marqué invalide et désigne son message',
    async (_nom, champ, role) => {
      const utilisateur = userEvent.setup()
      render(
        <FormulaireTest<Valeurs> defaultValues={DEFAUTS}>
          {(form) => (
            <>
              {champ(form.control as Control<Valeurs, unknown, FieldValues>)}
              <button
                type="button"
                onClick={() => {
                  form.setError('statut', { message: 'Choix obligatoire.' })
                  form.setError('date_prevue', {
                    message: 'Choix obligatoire.',
                  })
                }}
              >
                Soumettre
              </button>
            </>
          )}
        </FormulaireTest>,
      )

      await utilisateur.click(screen.getByRole('button', { name: 'Soumettre' }))
      const controle = screen.getByRole(role, { name: 'Libellé' })
      expect(controle).toHaveAttribute('aria-invalid', 'true')
      const decrit = (controle.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
      expect(decrit).toContain('Choix obligatoire.')
    },
  )

  // ORACLE : malgré tout, chaque champ doit être ATTEIGNABLE par son nom
  // accessible — c'est le minimum pour piloter un formulaire au lecteur d'écran.
  it('SelectField et DateField restent atteignables par leur nom accessible', () => {
    rendreChamp((c) => (
      <>
        <SelectField
          control={c}
          name="statut"
          label="Statut"
          options={[{ value: '1', label: 'Ouvert' }]}
        />
        <DateField control={c} name="date_prevue" label="Date prévue" />
      </>
    ))
    expect(screen.getByRole('combobox', { name: 'Statut' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Date prévue' }),
    ).toBeInTheDocument()
  })

  // ORACLE : documenté dans chaque champ — un champ requis est marqué d'une
  // astérisque dans son libellé.
  it('le marqueur « requis » est porté par le libellé', () => {
    rendreChamp((c) => (
      <TextField control={c} name="nom" label="Libellé" required />
    ))
    expect(screen.getByText('Libellé *')).toBeVisible()
  })
})

describe('fields/ — aller-retour des valeurs', () => {
  // ORACLE : ce que l'utilisateur tape est ce que le formulaire enregistre.
  it('TextField : la saisie atterrit inchangée dans le formulaire', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => <TextField control={c} name="nom" label="Libellé" />)

    await utilisateur.type(screen.getByLabelText('Libellé'), 'Ascenseur n°3')
    expect(valeurFormulaire('nom')).toBe('Ascenseur n°3')
  })

  // ORACLE : documenté — « La valeur vide devient `null` — le champ stocke
  // `number | null` ». Un `0` à la place d'un `null` serait une donnée fausse.
  it('NumberField : la saisie devient un nombre, le vide devient null', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => (
      <NumberField control={c} name="puissance" label="Puissance" unite="kW" />
    ))

    const champ = screen.getByLabelText('Puissance')
    await utilisateur.type(champ, '12.5')
    expect(valeurFormulaire('puissance')).toBe(12.5)

    await utilisateur.clear(champ)
    expect(valeurFormulaire('puissance')).toBeNull()
    expect(screen.getByText('kW')).toBeVisible()
  })

  // ORACLE : aller-retour sur une zone multiligne.
  it('TextareaField : la saisie atterrit inchangée', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => <TextareaField control={c} name="notes" label="Notes" />)

    await utilisateur.type(screen.getByLabelText('Notes'), 'Ligne 1')
    expect(valeurFormulaire('notes')).toBe('Ligne 1')
  })

  // ORACLE : documenté — `DescriptionField` est le champ « Description »
  // STANDARD : son libellé par défaut est « Description ».
  it('DescriptionField : libellé « Description » par défaut', () => {
    rendreChamp((c) => <DescriptionField control={c} name="description" />)
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
  })

  // ORACLE : documenté — « case à gauche, libellé à droite » lié au champ :
  // cliquer le libellé doit cocher.
  it('CheckboxField : cliquer le libellé bascule le booléen', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => (
      <CheckboxField control={c} name="actif" label="Compte actif" />
    ))

    await utilisateur.click(screen.getByText('Compte actif'))
    expect(valeurFormulaire('actif')).toBe(true)

    await utilisateur.click(screen.getByText('Compte actif'))
    expect(valeurFormulaire('actif')).toBe(false)
  })

  // ORACLE : un interrupteur expose le rôle ARIA `switch` (et non `checkbox`).
  it('SwitchField : rôle switch, et bascule enregistrée', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => (
      <SwitchField control={c} name="notifications" label="Notifications" />
    ))

    const interrupteur = screen.getByRole('switch', { name: 'Notifications' })
    await utilisateur.click(interrupteur)
    expect(valeurFormulaire('notifications')).toBe(true)
  })

  // ORACLE : un choix unique — sélectionner une option enregistre SA valeur.
  it('RadioField : l’option choisie est enregistrée', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => (
      <RadioField
        control={c}
        name="portee"
        label="Portée"
        options={[
          { value: 'site', label: 'Site' },
          { value: 'commun', label: 'Commun' },
        ]}
      />
    ))

    await utilisateur.click(screen.getByRole('radio', { name: 'Commun' }))
    expect(valeurFormulaire('portee')).toBe('commun')
  })

  // ORACLE : l'option choisie est enregistrée telle quelle.
  it('SelectField : l’option choisie est enregistrée', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => (
      <SelectField
        control={c}
        name="statut"
        label="Statut"
        options={[
          { value: '1', label: 'Ouvert' },
          { value: '2', label: 'Clôturé' },
        ]}
      />
    ))

    await utilisateur.click(screen.getByRole('combobox', { name: 'Statut' }))
    await utilisateur.click(
      await screen.findByRole('option', { name: 'Clôturé' }),
    )
    expect(valeurFormulaire('statut')).toBe('2')
  })

  // ORACLE : documenté — « l'option neutre vaut `''` côté formulaire », et elle
  // DOIT afficher son libellé une fois choisie (c'est toute la raison d'être de
  // la sentinelle interne : Radix avale un item à `value=""`).
  it('SelectField : l’option neutre enregistre une chaîne vide et reste affichée', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => (
      <SelectField
        control={c}
        name="statut"
        label="Statut"
        optionAucune="— Aucun —"
        options={[{ value: '1', label: 'Ouvert' }]}
      />
    ))

    const declencheur = screen.getByRole('combobox', { name: 'Statut' })
    await utilisateur.click(declencheur)
    await utilisateur.click(
      await screen.findByRole('option', { name: 'Ouvert' }),
    )
    expect(valeurFormulaire('statut')).toBe('1')

    await utilisateur.click(declencheur)
    await utilisateur.click(
      await screen.findByRole('option', { name: '— Aucun —' }),
    )
    expect(valeurFormulaire('statut')).toBe('')
    expect(declencheur).toHaveTextContent('— Aucun —')
  })

  // ORACLE : documenté — `onValueChange` est notifié APRÈS l'enregistrement de
  // la valeur dans le formulaire (un effet de bord lit donc un état à jour).
  it('SelectField : onValueChange reçoit la valeur enregistrée', async () => {
    const utilisateur = userEvent.setup()
    const vues: string[] = []
    rendreChamp((c) => (
      <SelectField
        control={c}
        name="statut"
        label="Statut"
        options={[{ value: '7', label: 'Clôturé' }]}
        onValueChange={(v) => vues.push(v)}
      />
    ))

    await utilisateur.click(screen.getByRole('combobox', { name: 'Statut' }))
    await utilisateur.click(
      await screen.findByRole('option', { name: 'Clôturé' }),
    )
    expect(vues).toEqual(['7'])
    expect(valeurFormulaire('statut')).toBe('7')
  })

  // ORACLE : documenté — `disabled` empêche la saisie.
  it('TextField désactivé : la saisie est impossible', async () => {
    const utilisateur = userEvent.setup()
    rendreChamp((c) => (
      <TextField control={c} name="nom" label="Libellé" disabled />
    ))

    const champ = screen.getByLabelText('Libellé')
    expect(champ).toBeDisabled()
    await utilisateur.type(champ, 'x')
    expect(valeurFormulaire('nom')).toBe('')
  })

  // ORACLE : documenté — `hint` est un « texte d'aide discret sous le champ »,
  // rattaché au champ par `aria-describedby` (FormControl/FormDescription).
  it('TextField : l’aide décrit le champ (aria-describedby)', () => {
    rendreChamp((c) => (
      <TextField
        control={c}
        name="nom"
        label="Libellé"
        hint="Visible dans les listes."
      />
    ))
    const champ = screen.getByLabelText('Libellé')
    const id = champ.getAttribute('aria-describedby')
    expect(document.getElementById(id ?? '')?.textContent).toBe(
      'Visible dans les listes.',
    )
  })
})
