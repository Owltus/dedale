import type { StatusTone } from '@/components/common/status-badge'

// Référentiel statuts_di (migration 052) : 1 Ouvert, 2 En cours, 3 Clôturé.
const LABELS: Record<number, string> = {
  1: 'Ouvert',
  2: 'En cours',
  3: 'Clôturé',
}

export function statutLabel(statutId: number): string {
  return LABELS[statutId] ?? 'Statut'
}

/**
 * Code couleur du statut DI, aligné sur le menu contextuel des Demandes :
 * Ouvert = gris (neutral), En cours = orange (warning), Clôturé = vert (success).
 * Consommé par la pastille réutilisable `StatusBadge`.
 */
export function statutTone(statutId: number): StatusTone {
  switch (statutId) {
    case 2:
      return 'warning' // En cours
    case 3:
      return 'success' // Clôturé (état clos)
    default:
      return 'neutral' // Ouvert (à traiter)
  }
}
