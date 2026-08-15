import type { ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import {
  SelectDropdown,
  type SelectOption,
} from '@/components/ui/select-dropdown'
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

/**
 * Sentinelle INTERNE de l'option neutre. Radix réserve la chaîne vide à
 * « pas de valeur » (`shouldShowPlaceholder`) : un item à `value=""` n'affiche
 * donc JAMAIS son libellé une fois choisi — le placeholder reprend la main.
 *
 * On passe donc à Radix une valeur non vide, et on la retraduit en `''` vers le
 * formulaire — `''` étant la convention du projet pour « absence » dans les
 * schémas (champs en `string` pour coller aux inputs, cf. `optionalIntId`).
 * La correction est purement d'AFFICHAGE : aucune validation ne change.
 * L'appelant ne voit jamais cette constante.
 */
const AUCUN = '__aucun__'

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  /** Options du menu déroulant Radix (`{ value, label }`). Jamais de `value: ''`. */
  options: SelectOption[]
  placeholder?: string
  required?: boolean
  /**
   * Ajoute une option neutre EN TÊTE (« — Aucun — ») dont la sélection vaut
   * `null` côté formulaire. À utiliser au lieu d'un item à `value: ''`, qui ne
   * s'affiche jamais. Deux formulations dans toute l'app : « — Aucun — » pour
   * une option facultative, « — Choisir … — » en `placeholder` d'un champ requis.
   */
  optionAucune?: string
  /** Texte d'aide discret sous le champ. */
  hint?: ReactNode
  disabled?: boolean
}

/**
 * Champ de sélection react-hook-form sur le `Select` Radix de shadcn
 * (`SelectDropdown`, panneau stylé/thémé) au lieu du `<select>` natif. API par
 * `options` (fini les `<option>` en enfants).
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  required = false,
  optionAucune,
  hint,
  disabled,
}: SelectFieldProps<T>) {
  // Garde-fou de développement : une option vide serait avalée par Radix.
  if (import.meta.env.DEV && options.some((o) => o.value === '')) {
    console.error(
      `SelectField « ${label} » : option à value="" — invisible une fois choisie. Utiliser optionAucune.`,
    )
  }

  const items = optionAucune
    ? [{ value: AUCUN, label: optionAucune }, ...options]
    : options

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? ' *' : ''}
          </FormLabel>
          <SelectDropdown
            // Valeur absente (`''`/`null`/`undefined`) → la sentinelle, pour
            // que « — Aucun — » s'affiche quand c'est le choix courant.
            value={
              field.value === null ||
              field.value === undefined ||
              field.value === ''
                ? optionAucune
                  ? AUCUN
                  : ''
                : String(field.value)
            }
            onValueChange={(v) => {
              field.onChange(v === AUCUN ? '' : v)
            }}
            options={items}
            placeholder={placeholder}
            disabled={disabled}
            ariaLabel={label}
          />
          {hint != null && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
