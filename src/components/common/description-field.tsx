import { TextareaField } from './textarea-field'

interface DescriptionFieldProps {
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  /** Libellé (défaut « Description »). */
  label?: string
  id?: string
}

/**
 * Champ « Description » STANDARD de toute l'app : zone de texte de hauteur FIXE
 * (2 lignes), NON redimensionnable, avec scrollbar interne au-delà. Présentation
 * unique → un changement (taille, style) se répercute partout d'un coup. À utiliser
 * pour tout texte libre de type description dans les formulaires (avec ou sans
 * image, via `IdentiteFields` ou directement).
 */
export function DescriptionField({
  value,
  onChange,
  error,
  required,
  label = 'Description',
  id,
}: DescriptionFieldProps) {
  return (
    <TextareaField
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      required={required}
      rows={2}
      // `min-h-0` neutralise le plancher de hauteur du Textarea pour obtenir une
      // vraie zone de 2 lignes ; `resize-none` la fige (scrollbar interne au-delà).
      className="min-h-0 resize-none"
    />
  )
}
