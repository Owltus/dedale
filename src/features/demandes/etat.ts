import type { ComponentProps } from 'react'
import type { Badge } from '@/components/ui/badge'

type BadgeVariant = ComponentProps<typeof Badge>['variant']

// Référentiel statuts_di : 1 Ouverte, 2 Résolue, 3 Réouverte.
const LABELS: Record<number, string> = {
  1: 'Ouverte',
  2: 'Résolue',
  3: 'Réouverte',
}

export function statutLabel(statutId: number): string {
  return LABELS[statutId] ?? 'Statut'
}

export function statutBadgeVariant(statutId: number): BadgeVariant {
  switch (statutId) {
    case 2:
      return 'secondary' // Résolue
    case 3:
      return 'destructive' // Réouverte
    default:
      return 'default' // Ouverte
  }
}
