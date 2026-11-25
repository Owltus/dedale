import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'

import {
  STATUT_DI_CLOTURE,
  STATUT_DI_EN_COURS,
  STATUT_DI_OUVERT,
} from '@/lib/statuts-di'

// Référentiel statuts_di (migration 052) : 1 Ouvert, 2 En cours, 3 Clôturé.
// Les codes vivent dans `lib/statuts-di.ts` (importable par `lib/permissions`) ;
// ce fichier reste le point d'entrée de la feature et les ré-exporte.
export { STATUT_DI_CLOTURE, STATUT_DI_EN_COURS, STATUT_DI_OUVERT }

const LABELS: Record<number, string> = {
  [STATUT_DI_OUVERT]: 'Ouvert',
  [STATUT_DI_EN_COURS]: 'En cours',
  [STATUT_DI_CLOTURE]: 'Clôturé',
}

export function statutLabel(statutId: number): string {
  return LABELS[statutId] ?? 'Statut'
}

/**
 * Statut TERMINAL d'une DI (Clôturé) : exclu par défaut du filtre « Non terminés »
 * de la liste (cf. `matchStatutFilter`). Ouvert et En cours restent visibles.
 */
export const STATUTS_DI_TERMINAUX = [STATUT_DI_CLOTURE] as const

/**
 * Code couleur du statut DI, aligné sur le menu contextuel des Demandes :
 * Ouvert = gris (neutral), En cours = orange (warning), Clôturé = vert (success).
 * Consommé par la pastille réutilisable `StatusBadge`.
 */
const TONES: Record<number, StatusTone> = {
  [STATUT_DI_EN_COURS]: 'warning',
  [STATUT_DI_CLOTURE]: 'success', // état clos
  // STATUT_DI_OUVERT (à traiter) → repli neutral
}
export function statutTone(statutId: number): StatusTone {
  return statusToneById(statutId, TONES)
}

/** Titre d'une DI sans lieu (aucun local rattaché). */
export const LIEU_NON_PRECISE = 'Lieu non précisé'
