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
  /**
   * Variante du `Button` shadcn. CONVENTION barre de titre : `outline` (bordure) —
   * style harmonisé de tous les boutons de topbar. Défaut `ghost` (sans bordure)
   * pour les actions de ligne / de section dans le contenu.
   */
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
  const button = (
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
  )
  return (
    <Tooltip>
      {/* Bouton désactivé : `pointer-events-none` + attribut natif `disabled`
          empêchent le TooltipTrigger Radix de s'ouvrir. On enveloppe alors le
          bouton dans un `<span>` focusable qui porte le déclencheur (survol /
          focus), pour que l'explication reste visible même désactivé. */}
      <TooltipTrigger asChild>
        {disabled ? (
          <span tabIndex={0} className="inline-flex shrink-0">
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
