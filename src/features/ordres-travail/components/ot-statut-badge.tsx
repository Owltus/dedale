import { statutAffichageOt } from '../statut-affichage'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/common/status-badge'

interface OtStatutBadgeProps {
  statut: string
  origine?: string | null
  datePrevue: string | null
  toleranceJours: number
  className?: string
}

/**
 * Badge de statut d'un OT : pastille teintée `StatusBadge` dont le libellé et la
 * couleur reflètent le statut d'AFFICHAGE — statut métier, ou statut TEMPOREL
 * dérivé du temps restant pour un OT planifié (cf. `statutAffichageOt`). Brique
 * UNIQUE réutilisée par la fiche détail, les cartes de liste et le dialogue du
 * planning → un seul endroit pour les libellés et le code couleur.
 */
export function OtStatutBadge({
  statut,
  origine,
  datePrevue,
  toleranceJours,
  className,
}: OtStatutBadgeProps) {
  const { label, tone } = statutAffichageOt({
    statut,
    origine,
    datePrevue,
    toleranceJours,
  })
  return (
    <StatusBadge tone={tone} className={cn('shrink-0', className)}>
      {label}
    </StatusBadge>
  )
}
