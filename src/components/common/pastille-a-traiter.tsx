import { cn } from '@/lib/utils'

/**
 * Compteur discret « reste à traiter », posé à côté d'un libellé (sidebar,
 * onglets). Rien n'est affiché à zéro ; au-delà de 99, « 99+ ».
 */
export function PastilleATraiter({
  nombre,
  className,
}: {
  nombre: number
  className?: string
}) {
  if (nombre <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums',
        className,
      )}
    >
      {nombre > 99 ? '99+' : nombre}
      <span className="sr-only"> non clôturés</span>
    </span>
  )
}
