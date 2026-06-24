import 'react-day-picker/style.css'
import type { ComponentProps } from 'react'
import { DayPicker } from 'react-day-picker'
import { fr } from 'react-day-picker/locale'
import { cn } from '@/lib/utils'

export type CalendarProps = ComponentProps<typeof DayPicker>

/**
 * Calendrier shadcn (react-day-picker), en français. Le style de base de la
 * librairie est repris et recoloré via les variables `--rdp-*` mappées sur les
 * tokens du thème (classe `dedale-rdp`, cf. index.css) → rendu clair/sombre
 * cohérent. À utiliser dans un `Popover`.
 */
export function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={fr}
      showOutsideDays
      className={cn('dedale-rdp p-3', className)}
      {...props}
    />
  )
}
