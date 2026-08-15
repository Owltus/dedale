import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { todayLocal } from '@/lib/date'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface DateFieldProps {
  /** Date au format `YYYY-MM-DD` (vide = non renseignée). */
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  /** Largeur / hauteur du déclencheur (ex. `h-8 w-[7.25rem]`, `w-full`). */
  className?: string
  ariaLabel?: string
  /** Mois/année en menus déroulants (défaut) ou libellé simple + flèches. */
  captionLayout?: 'label' | 'dropdown'
  /** Texte du déclencheur quand aucune date (défaut `jj/mm/aaaa`). */
  placeholder?: string
}

// `YYYY-MM-DD` ⇄ Date (locale, sans décalage de fuseau).
function parseIsoDate(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
function toIsoDate(date: Date): string {
  const y = String(date.getFullYear())
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

// Bornes du sélecteur d'année (menus déroulants) : large fourchette couvrant
// dates anciennes … échéances futures.
const AN_DEBUT = new Date(1950, 0, 1)
const AN_FIN = new Date(new Date().getFullYear() + 20, 11, 31)

/**
 * Champ DATE « à la française » : déclencheur stylé (cadre `Input`, date en
 * `jj/mm/aaaa`) ouvrant un `Popover` avec le `Calendar` shadcn (react-day-picker,
 * locale fr → **lundi en premier**). Caption en menus déroulants mois/année par
 * défaut. Pied « Effacer » / « Aujourd'hui ». La valeur reste au format ISO
 * `YYYY-MM-DD`. Pour un formulaire react-hook-form, utiliser la brique
 * `@/components/common/fields/date-field` (label + erreur) qui l'enveloppe.
 */
export function DateField({
  value,
  onValueChange,
  disabled,
  className,
  ariaLabel,
  captionLayout = 'dropdown',
  placeholder = 'jj/mm/aaaa',
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = parseIsoDate(value)

  return (
    // `modal` : le popover est portalisé ; sans lui, à l'intérieur d'une modale
    // Dialog, cliquer un jour est vu comme un « clic extérieur » et FERME la
    // modale. En modal, Radix reconnaît le calendrier comme couche intérieure.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'flex h-9 items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span
            className={cn('truncate', !selected && 'text-muted-foreground')}
          >
            {selected ? selected.toLocaleDateString('fr-FR') : placeholder}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout={captionLayout}
          startMonth={AN_DEBUT}
          endMonth={AN_FIN}
          onSelect={(d) => {
            if (d) {
              onValueChange(toIsoDate(d))
              setOpen(false)
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onValueChange('')
              setOpen(false)
            }}
          >
            Effacer
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onValueChange(todayLocal())
              setOpen(false)
            }}
          >
            Aujourd'hui
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
