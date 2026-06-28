import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'

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
 * Statut TERMINAL d'une DI (Clôturé) : exclu par défaut du filtre « Non terminés »
 * de la liste (cf. `matchStatutFilter`). Ouvert et En cours restent visibles.
 */
export const STATUTS_DI_TERMINAUX = [3] as const

/**
 * Code couleur du statut DI, aligné sur le menu contextuel des Demandes :
 * Ouvert = gris (neutral), En cours = orange (warning), Clôturé = vert (success).
 * Consommé par la pastille réutilisable `StatusBadge`.
 */
const TONES: Record<number, StatusTone> = {
  2: 'warning', // En cours
  3: 'success', // Clôturé (état clos)
  // 1 (Ouvert / à traiter) → repli neutral
}
export function statutTone(statutId: number): StatusTone {
  return statusToneById(statutId, TONES)
}
