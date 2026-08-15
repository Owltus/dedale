import { type KeyboardEventHandler } from 'react'
import { cn } from '@/lib/utils'

/**
 * Saisie numérique avec l'unité accolée en suffixe, dans un cadre aux tokens d'`Input`
 * (nombre aligné à DROITE, l'unité le suit immédiatement). Brique UNIQUE réutilisée
 * pour la valeur mesurée ET les index de remplacement → unité affichée partout, look
 * homogène. Le champ valeur passe `dataOpValue`/`onKeyDown` (navigation Tab en série)
 * et `emphaseClassName` (couleur de conformité) ; les index s'en passent.
 */
export function ChampNombreUnite({
  value,
  onValueChange,
  ariaLabel,
  unite,
  widthClassName = 'w-28',
  disabled,
  placeholder,
  title,
  emphaseClassName,
  bold,
  dataOpValue,
  onKeyDown,
}: {
  value: string
  onValueChange: (v: string) => void
  ariaLabel: string
  unite: string | null
  widthClassName?: string
  disabled?: boolean
  placeholder?: string
  title?: string
  emphaseClassName?: string
  bold?: boolean
  dataOpValue?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 shadow-xs transition-[color,box-shadow] pointer-coarse:h-10',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        widthClassName,
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={cn(
          'no-spinner w-full min-w-0 border-0 bg-transparent p-0 text-right text-sm outline-none placeholder:text-muted-foreground',
          emphaseClassName,
          bold && 'font-medium',
        )}
        aria-label={ariaLabel}
        placeholder={placeholder}
        title={title}
        value={value}
        disabled={disabled}
        data-op-value={dataOpValue ? '' : undefined}
        onKeyDown={onKeyDown}
        onChange={(e) => onValueChange(e.target.value)}
      />
      {unite && (
        <span
          className={cn(
            'shrink-0 text-xs text-muted-foreground',
            emphaseClassName,
          )}
        >
          {unite}
        </span>
      )}
    </div>
  )
}
