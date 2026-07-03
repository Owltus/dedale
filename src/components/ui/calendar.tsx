import 'react-day-picker/style.css'
import type { ChangeEvent, ComponentProps } from 'react'
import { DayPicker, type DropdownProps } from 'react-day-picker'
import { fr } from 'react-day-picker/locale'
import { cn } from '@/lib/utils'
import { SelectDropdown } from '@/components/ui/select-dropdown'

export type CalendarProps = ComponentProps<typeof DayPicker>

// Caption « mois / année » en menus déroulants : par défaut react-day-picker rend
// des `<select>` NATIFS (liste ouverte = celle du navigateur, hors thème). On
// surcharge le composant `Dropdown` (utilisé par MonthsDropdown ET YearsDropdown)
// pour rendre notre `SelectDropdown` **Radix** (panneau entièrement custom/thémé,
// comme les autres sélecteurs de l'app). On ponte l'`onChange` natif attendu par
// react-day-picker via un événement synthétique `{ target: { value } }`.
const CALENDAR_COMPONENTS = {
  Dropdown: ({
    options,
    value,
    onChange,
    disabled,
    'aria-label': ariaLabel,
  }: DropdownProps) => {
    const opts = (options ?? []).map((o) => ({
      value: String(o.value),
      label: o.label,
    }))
    // Années = labels numériques → sélecteur plus étroit ; mois = plus large et
    // FIXE (encaisse « septembre » sans jamais changer de taille).
    const isYear = opts.every((o) => /^\d+$/.test(o.label))
    return (
      <SelectDropdown
        value={String(value ?? '')}
        onValueChange={(v) =>
          onChange?.({
            target: { value: v },
          } as unknown as ChangeEvent<HTMLSelectElement>)
        }
        options={opts}
        disabled={disabled}
        ariaLabel={ariaLabel}
        checkIndicator={false}
        centered
        className={cn(
          'h-8 gap-1 px-2 font-medium',
          isYear ? 'w-[5.5rem]' : 'w-[8.5rem]',
        )}
      />
    )
  },
}

/**
 * Calendrier shadcn (react-day-picker v10), en français (→ lundi en premier). Le
 * style de base est recoloré via les variables `--rdp-*` mappées sur les tokens du
 * thème (classe `dedale-rdp`, cf. index.css). Le caption mois/année utilise notre
 * `SelectDropdown` Radix (panneau custom, cf. `CALENDAR_COMPONENTS`).
 * react-day-picker rend déjà ses boutons en `type="button"`. À utiliser dans un
 * `Popover`.
 */
export function Calendar({ className, components, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={fr}
      showOutsideDays
      className={cn('dedale-rdp p-3', className)}
      components={{ ...CALENDAR_COMPONENTS, ...components }}
      {...props}
    />
  )
}
