import type { StatusTone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'

// Remplissage par tonalité sémantique (tokens d'état, jamais de couleur en dur).
const BAR_TONE: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  violet: 'bg-violet',
  yellow: 'bg-yellow',
}

/**
 * Barre de progression neutre et réutilisable (le design system n'en avait aucune).
 * `value` est borné à [0..1] ; la couleur est pilotée par `tone`. Accessible
 * (`role="progressbar"`). Ne porte aucune logique métier — l'appelant fournit la
 * valeur et la tonalité.
 */
export function ProgressBar({
  value,
  tone = 'neutral',
  className,
  label,
}: {
  value: number
  tone?: StatusTone
  className?: string
  label?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className={cn(
        'bg-muted h-2 w-full overflow-hidden rounded-full',
        className,
      )}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-all', BAR_TONE[tone])}
        style={{ width: `${String(pct)}%` }}
      />
    </div>
  )
}
