import { SelectField } from '@/components/common/select-field'

/** Périmètre d'une entité de bibliothèque : commun à l'entreprise ou propre au site. */
export type Portee = 'entreprise' | 'site'

interface PorteeFieldProps {
  value: Portee
  onChange: (value: Portee) => void
  /**
   * Affiche l'option « Commun » (entreprise). L'appelant décide selon le rôle
   * (droit sur le scope entreprise) OU si la valeur courante l'est déjà.
   */
  showEntreprise: boolean
  /** Site actif : l'option « site » n'apparaît que si un site est sélectionné. */
  siteId: string | null
  /** Libellé de l'option site (repli « Site actif » si le nom manque). */
  siteName: string | null
  error?: string
  /** Lecture seule (ex. portée immuable après création — trigger backend). */
  disabled?: boolean
  /** Ne rend rien (remplace un `{!hidePortee && …}` côté appelant). */
  hidden?: boolean
}

/**
 * Champ « Portée » commun aux modales Bibliothèque (catégories, modèles
 * d'équipement, modèles de DI…) : un `SelectField` proposant « Commun »
 * (conditionnel) et le site actif. La logique de visibilité/verrouillage
 * (droit entreprise, mode masqué) reste décidée par l'appelant via les props.
 */
export function PorteeField({
  value,
  onChange,
  showEntreprise,
  siteId,
  siteName,
  error,
  disabled,
  hidden,
}: PorteeFieldProps) {
  if (hidden) return null
  return (
    <SelectField
      label="Portée"
      value={value}
      onChange={(v) => onChange(v as Portee)}
      error={error}
      disabled={disabled}
      required
    >
      {showEntreprise && <option value="entreprise">Commun</option>}
      {siteId && <option value="site">{siteName ?? 'Site actif'}</option>}
    </SelectField>
  )
}
