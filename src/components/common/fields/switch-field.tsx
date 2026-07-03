import type { ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Switch } from '@/components/ui/switch'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface SwitchFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: ReactNode
  /** Texte d'aide sous le libellé (explique l'effet du on/off). */
  description?: ReactNode
  disabled?: boolean
}

/**
 * Champ booléen react-hook-form : libellé (+ description) à gauche, interrupteur
 * à droite. À préférer à un `SelectField` à deux options pour un choix binaire.
 */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
}: SwitchFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-1">
              <FormLabel className="cursor-pointer">{label}</FormLabel>
              {description != null && (
                <FormDescription>{description}</FormDescription>
              )}
            </div>
            <FormControl>
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                disabled={disabled ?? field.disabled}
              />
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
