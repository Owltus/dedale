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

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  /** Options du menu déroulant Radix (`{ value, label }`). */
  options: SelectOption[]
  placeholder?: string
  required?: boolean
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
  hint,
  disabled,
}: SelectFieldProps<T>) {
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
            value={field.value ?? ''}
            onValueChange={field.onChange}
            options={options}
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
