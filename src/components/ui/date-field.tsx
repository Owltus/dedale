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
  /** Largeur / hauteur du déclencheur (ex. `h-8 w-[7.25rem]`). */
  className?: string
  ariaLabel?: string
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

/**
 * Champ DATE : déclencheur stylé (cadre `Input`, date formatée fr) ouvrant un
 * `Popover` qui contient le `Calendar` shadcn (react-day-picker). Pied avec
 * « Effacer » et « Aujourd'hui » (comme le picker natif). La valeur reste au
 * format `YYYY-MM-DD`.
 */
export function DateField({
  value,
  onValueChange,
  disabled,
  className,
  ariaLabel,
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = parseIsoDate(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'border-input bg-background flex h-9 items-center justify-between gap-1.5 rounded-md border px-2 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.toLocaleDateString('fr-FR') : 'jj/mm/aaaa'}
          </span>
          <CalendarDays className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
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
