import type { ComponentProps, ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Textarea } from '@/components/ui/textarea'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface TextareaFieldProps<T extends FieldValues>
  extends Omit<
    ComponentProps<'textarea'>,
    'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
  > {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  required?: boolean
  hint?: ReactNode
}

/** Champ texte multiligne react-hook-form (modèle `TextField`). */
export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  hint,
  rows = 4,
  ...props
}: TextareaFieldProps<T>) {
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
            <Textarea
              {...props}
              rows={rows}
              name={field.name}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              disabled={field.disabled ?? props.disabled}
            />
          </FormControl>
          {hint != null && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
