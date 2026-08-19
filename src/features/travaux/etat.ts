import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'
import { STATUT_TERMINE, STATUT_EN_COURS } from './schemas'

/**
 * Statuts TERMINAUX d'un travaux : exclus par défaut du filtre « Non
 * terminés » des listes (cf. `matchStatutFilter`).
 */
export const STATUTS_TRAVAUX_TERMINAUX = [STATUT_TERMINE] as const

/**
 * Code couleur (tone) d'un statut de travaux, pour la pastille `StatusBadge`
 * et le liseré de card : Ouvert = gris, En cours = jaune, Terminé = vert.
 */
const TONES: Record<number, StatusTone> = {
  [STATUT_EN_COURS]: 'yellow',
  [STATUT_TERMINE]: 'success',
  // STATUT_OUVERT → repli neutral
}
export function statutTravauxTone(id: number): StatusTone {
  return statusToneById(id, TONES)
}
