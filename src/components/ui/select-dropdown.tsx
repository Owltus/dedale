import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectDropdownProps {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Largeur / hauteur du déclencheur (ex. `h-8 w-36`). */
  className?: string
  ariaLabel?: string
  /**
   * Affiche la coche à gauche de l'option active (défaut `true`). `false` =
   * l'option active est simplement SURLIGNÉE (fond `accent`), sans coche ni
   * retrait à gauche — pour un rendu de sélection standard/compact.
   */
  checkIndicator?: boolean
  /** Centre la valeur dans le déclencheur (compense le chevron). Défaut `false`. */
  centered?: boolean
}

/**
 * Menu déroulant shadcn basé sur Radix Select : déclencheur stylé (tokens de
 * thème, focus ring, désactivé) + panneau d'options en POPOVER (animé, fond
 * `popover`, item surligné `accent`, coche sur l'option active, boutons de
 * défilement pour les listes longues). Contrairement au `<select>` natif
 * (`SelectMenu`), le panneau ouvert est entièrement stylé et suit le thème
 * clair/sombre. API simple `value` / `onValueChange` / `options`.
 */
export function SelectDropdown({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel,
  checkIndicator = true,
  centered = false,
}: SelectDropdownProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'border-input bg-background data-[placeholder]:text-muted-foreground flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        {/* Phantom de la taille du chevron : équilibre le centrage de la valeur. */}
        {centered && <span aria-hidden="true" className="size-4 shrink-0" />}
        <SelectPrimitive.Value
          placeholder={placeholder}
          className={cn(centered && 'flex-1 truncate text-center')}
        />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            // Largeur du panneau = largeur EXACTE du déclencheur (pas plus large).
            'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-[18rem] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border shadow-md',
          )}
        >
          <SelectPrimitive.ScrollUpButton className="text-muted-foreground flex cursor-default items-center justify-center py-1">
            <ChevronUp className="size-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className={cn(
                  'focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  checkIndicator
                    ? 'pl-8'
                    : 'pl-2 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground data-[state=checked]:font-medium',
                  centered && 'justify-center',
                )}
              >
                {checkIndicator && (
                  <span className="absolute left-2 flex size-4 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                      <Check className="size-4" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                )}
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="text-muted-foreground flex cursor-default items-center justify-center py-1">
            <ChevronDown className="size-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
