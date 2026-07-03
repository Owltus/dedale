import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { SelectField } from './select-field'

/** Périmètre d'une entité de bibliothèque : commun à l'entreprise ou propre au site. */
export type Portee = 'entreprise' | 'site'

interface PorteeFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  /** Affiche l'option « Commun » (entreprise). L'appelant décide selon le rôle. */
  showEntreprise: boolean
  /** Site actif : l'option « site » n'apparaît que si un site est sélectionné. */
  siteId: string | null
  /** Libellé de l'option site (repli « Site actif » si le nom manque). */
  siteName: string | null
  /** Lecture seule (ex. portée immuable après création — trigger backend). */
  disabled?: boolean
  /** Ne rend rien (remplace un `{!hidePortee && …}` côté appelant). */
  hidden?: boolean
}

/**
 * Champ « Portée » des modales Bibliothèque : un `SelectField` proposant « Commun »
 * (conditionnel) et le site actif. Version react-hook-form.
 */
export function PorteeField<T extends FieldValues>({
  control,
  name,
  showEntreprise,
  siteId,
  siteName,
  disabled,
  hidden,
}: PorteeFieldProps<T>) {
  if (hidden) return null
  const options = [
    ...(showEntreprise ? [{ value: 'entreprise', label: 'Commun' }] : []),
    ...(siteId ? [{ value: 'site', label: siteName ?? 'Site actif' }] : []),
  ]
  return (
    <SelectField
      control={control}
      name={name}
      label="Portée"
      options={options}
      required
      disabled={disabled}
    />
  )
}
