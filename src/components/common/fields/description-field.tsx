import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { TextareaField } from './textarea-field'

interface DescriptionFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  /** Libellé (défaut « Description »). */
  label?: string
  required?: boolean
  /**
   * Hauteur en lignes (défaut 2 — la description d'appoint de l'app).
   *
   * À augmenter quand le texte est le SUJET du formulaire et non un complément :
   * un compte-rendu de clôture sur deux lignes se lit à travers une meurtrière,
   * alors que le dialogue n'a que ça à montrer.
   */
  rows?: number
}

/**
 * Champ « Description » STANDARD de l'app : zone NON redimensionnable (scrollbar
 * interne au-delà), 2 lignes par défaut. Présentation unique → un changement de
 * style se répercute partout ; seule la hauteur se règle par appel.
 * Version react-hook-form.
 */
export function DescriptionField<T extends FieldValues>({
  control,
  name,
  label = 'Description',
  required,
  rows = 2,
}: DescriptionFieldProps<T>) {
  return (
    <TextareaField
      control={control}
      name={name}
      label={label}
      required={required}
      rows={rows}
      className="min-h-0 resize-none"
    />
  )
}
