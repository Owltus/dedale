import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps
  extends Omit<ComponentProps<'button'>, 'onChange' | 'type' | 'role'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/**
 * Interrupteur on/off accessible (`role="switch"`), contrôlé, sans dépendance
 * externe. Brique de base : l'habillage libellé + description vit dans
 * `SwitchField` (common). Style aligné sur shadcn (piste `bg-primary`/`bg-input`,
 * pastille `bg-background`).
 */
function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-slot="switch"
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'bg-background pointer-events-none block size-5 rounded-full shadow-sm ring-0 transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export { Switch }
