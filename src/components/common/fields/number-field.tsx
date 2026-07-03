import type { ReactNode } from 'react'
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

interface NumberFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  required?: boolean
  /** Unité affichée en suffixe (ex. kW, bars). */
  unite?: string
  placeholder?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number | string
  hint?: ReactNode
}

/**
 * Champ numérique react-hook-form : `Input type=number` + unité optionnelle. La
 * valeur vide devient `null` (comme un `NaN`) — le champ stocke `number | null`.
 */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  unite,
  placeholder,
  disabled,
  min,
  max,
  step = 'any',
  hint,
}: NumberFieldProps<T>) {
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
          <div className="flex items-center gap-2">
            <FormControl>
              <Input
                type="number"
                step={step}
                min={min}
                max={max}
                placeholder={placeholder}
                name={field.name}
                value={field.value ?? ''}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    field.onChange(null)
                    return
                  }
                  const n = Number(raw)
                  field.onChange(Number.isNaN(n) ? null : n)
                }}
                onBlur={field.onBlur}
                ref={field.ref}
                disabled={disabled ?? field.disabled}
              />
            </FormControl>
            {unite != null && (
              <span className="text-muted-foreground shrink-0 text-sm">
                {unite}
              </span>
            )}
          </div>
          {hint != null && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
