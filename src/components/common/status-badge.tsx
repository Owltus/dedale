import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Tonalité sémantique d'un statut, alignée sur les tokens d'état de l'app
 * (cf. `src/index.css`). `neutral` = état au repos (gris) ; les autres reprennent
 * --success / --warning / --destructive / --info.
 */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info'

// Pastille TEINTÉE : fond doux (couleur à 10 %), texte de la couleur, liseré
// discret. Les tokens d'état sont foncés en thème clair → texte AA lisible.
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-transparent bg-muted text-muted-foreground',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
  info: 'border-info/20 bg-info/10 text-info',
}

/**
 * Badge de statut minimaliste qui PREND LE CODE COULEUR sémantique (pastille
 * teintée). Brique réutilisable partout où un statut porte une tonalité —
 * Demandes, Travaux, Investissements… : la feature mappe son statut métier →
 * `tone`, cette brique ne porte que la mise en forme (aucune logique).
 */
export function StatusBadge({
  tone,
  className,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'variant'> & { tone: StatusTone }) {
  return (
    <Badge
      variant="outline"
      className={cn(TONE_CLASSES[tone], className)}
      {...props}
    />
  )
}
