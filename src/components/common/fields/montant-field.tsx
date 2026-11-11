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
import { nettoyerMontant } from '@/lib/montant-saisie'

interface MontantFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  required?: boolean
  placeholder?: string
  /** Texte d'aide discret sous le champ. */
  hint?: ReactNode
}

/**
 * Champ MONTANT react-hook-form (demande PO du 11/11/2026) : la valeur reste
 * du TEXTE (« 1222,50 », converti par l'appelant), mais seules les saisies
 * monétaires passent — chiffres et un séparateur, deux décimales au plus
 * (`nettoyerMontant`). Clavier numérique sur téléphone.
 */
export function MontantField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  placeholder = '0,00',
  hint,
}: MontantFieldProps<T>) {
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
              inputMode="decimal"
              autoComplete="off"
              placeholder={placeholder}
              name={field.name}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(nettoyerMontant(e.target.value))}
              onBlur={field.onBlur}
              ref={field.ref}
              disabled={field.disabled}
              className="tabular-nums"
            />
          </FormControl>
          {hint != null && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
