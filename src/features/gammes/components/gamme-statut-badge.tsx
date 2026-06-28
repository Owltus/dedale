import { statutAffichageGamme } from '../statut-affichage'
import type { OtTriable } from '@/features/ordres-travail/tri'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/common/status-badge'

interface GammeStatutBadgeProps {
  /** Gamme active ? (désactivée → « Inactive »). */
  estActive: boolean
  /** OT de la gamme (sous-ensemble triable) ; vide → « Non assigné ». */
  ots: OtTriable[]
  className?: string
}

/**
 * Badge de statut d'une GAMME : pastille teintée `StatusBadge` dont le libellé et
 * la couleur synthétisent l'état le plus urgent de ses OT (cf.
 * `statutAffichageGamme`). Brique UNIQUE, miroir de `OtStatutBadge` → un seul
 * endroit pour les libellés et le code couleur de la gamme (carte de liste, fiche
 * détail, planning à venir).
 */
export function GammeStatutBadge({
  estActive,
  ots,
  className,
}: GammeStatutBadgeProps) {
  const { label, tone } = statutAffichageGamme({ estActive, ots })
  return (
    <StatusBadge tone={tone} className={cn('shrink-0', className)}>
      {label}
    </StatusBadge>
  )
}
