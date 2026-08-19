import { SelectDropdown } from '@/components/ui/select-dropdown'
import { toneBadgeClasses, type StatusTone } from './status-badge'
import { cn } from '@/lib/utils'

interface StatusTransitionSelectProps {
  value: string
  tone: StatusTone
  options: { value: string; label: string }[]
  onValueChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}

/**
 * Badge de statut qui EST aussi le menu de transition : remplace la frise
 * pleine largeur en en-tête de fiche (090, étape 7) — même information
 * (statut courant + capacité de le changer), en une pastille compacte posée
 * à côté du titre. Les règles de transition (quels statuts sont permis, pour
 * quel rôle, clôture via dialogue dédié) restent celles de l'appelant ; ce
 * composant ne fait QUE l'habillage visuel.
 */
export function StatusTransitionSelect({
  value,
  tone,
  options,
  onValueChange,
  disabled,
  ariaLabel,
}: StatusTransitionSelectProps) {
  return (
    <SelectDropdown
      value={value}
      onValueChange={onValueChange}
      options={options}
      disabled={disabled}
      ariaLabel={ariaLabel}
      checkIndicator={false}
      className={cn(
        'h-7 w-auto gap-1 rounded-full border px-3 text-xs font-medium shadow-none',
        toneBadgeClasses(tone),
      )}
    />
  )
}
