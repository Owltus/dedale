import type { ComponentProps, ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface TextFieldProps<T extends FieldValues> extends Omit<
  ComponentProps<'input'>,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  required?: boolean
  /** Texte d'aide discret sous le champ. */
  hint?: ReactNode
}

/**
 * Champ texte react-hook-form : `FormItem` (libellé + `Input` + message). Branché
 * sur `control`/`name`, l'erreur du resolver Zod est rendue par `FormMessage`.
 */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  hint,
  ...inputProps
}: TextFieldProps<T>) {
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
          <FormControl>
            <Input
              {...inputProps}
              name={field.name}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              disabled={field.disabled ?? inputProps.disabled}
            />
          </FormControl>
          {hint != null && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
