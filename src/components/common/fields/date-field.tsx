import type { ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { DateField as DatePicker } from '@/components/ui/date-field'
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface DateFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  required?: boolean
  disabled?: boolean
  /** Texte d'aide discret sous le champ. */
  hint?: ReactNode
}

/**
 * Champ DATE react-hook-form « à la française » : libellé + sélecteur calendrier
 * (Popover + `Calendar` shadcn, locale fr → lundi en premier, mois/année en
 * menus déroulants, affichage `jj/mm/aaaa`) + message d'erreur. La valeur stockée
 * reste au format ISO `YYYY-MM-DD`. Remplace le natif `TextField type="date"`.
 */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  disabled,
  hint,
}: DateFieldProps<T>) {
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
          <DatePicker
            value={field.value ?? ''}
            onValueChange={field.onChange}
            disabled={disabled}
            ariaLabel={label}
            className="w-full"
          />
          {hint != null && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
