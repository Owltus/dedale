import type { ComponentProps } from 'react'
import type { Badge } from '@/components/ui/badge'

type BadgeVariant = ComponentProps<typeof Badge>['variant']

// Référentiel statuts_di (migration 052) : 1 Ouvert, 2 En cours, 3 Clôturé.
const LABELS: Record<number, string> = {
  1: 'Ouvert',
  2: 'En cours',
  3: 'Clôturé',
}

export function statutLabel(statutId: number): string {
  return LABELS[statutId] ?? 'Statut'
}

export function statutBadgeVariant(statutId: number): BadgeVariant {
  switch (statutId) {
    case 2:
      return 'secondary' // En cours
    case 3:
      return 'outline' // Clôturé (état clos, faible emphase)
    default:
      return 'default' // Ouvert (à traiter)
  }
}
