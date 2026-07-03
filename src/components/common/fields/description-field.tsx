import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { TextareaField } from './textarea-field'

interface DescriptionFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  /** Libellé (défaut « Description »). */
  label?: string
  required?: boolean
}

/**
 * Champ « Description » STANDARD de l'app : zone de 2 lignes NON redimensionnable
 * (scrollbar interne au-delà). Présentation unique → un changement se répercute
 * partout. Version react-hook-form.
 */
export function DescriptionField<T extends FieldValues>({
  control,
  name,
  label = 'Description',
  required,
}: DescriptionFieldProps<T>) {
  return (
    <TextareaField
      control={control}
      name={name}
      label={label}
      required={required}
      rows={2}
      className="min-h-0 resize-none"
    />
  )
}
