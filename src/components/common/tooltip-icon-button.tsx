import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TooltipIconButtonProps {
  /** Icône (SVG lucide) rendue seule dans le bouton. */
  icon: ReactNode
  /** Libellé : sert au tooltip (survol) ET au nom accessible (`aria-label`). */
  label: string
  onClick?: () => void
  /** Variante du `Button` shadcn (défaut `ghost`, action secondaire). */
  variant?: ComponentProps<typeof Button>['variant']
  disabled?: boolean
  type?: ComponentProps<typeof Button>['type']
}

/**
 * Bouton d'action ICÔNE SEULE de barre de titre : le libellé est porté par un
 * tooltip (au survol) et par l'`aria-label` (accessibilité), jamais par du
 * texte visible. Nécessite un `TooltipProvider` global (monté à la racine de
 * l'app, cf. `routes/_app.tsx`). Carré (`size="icon"`) pour une barre nette.
 */
export function TooltipIconButton({
  icon,
  label,
  onClick,
  variant = 'ghost',
  disabled,
  type = 'button',
}: TooltipIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type={type}
          size="icon"
          variant={variant}
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className="shrink-0"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
