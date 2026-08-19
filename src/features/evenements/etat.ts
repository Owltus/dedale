import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'
import { STATUT_EN_COURS, STATUT_CLOTURE } from './schemas'

/**
 * Statuts TERMINAUX d'un événement : exclus par défaut du filtre « Non
 * terminés » des listes (cf. `matchStatutFilter`).
 */
export const STATUTS_EVENEMENTS_TERMINAUX = [STATUT_CLOTURE] as const

/**
 * Code couleur d'un statut : Ouvert = gris (au repos), En cours = jaune (on s'en
 * occupe), Clôturé = vert.
 */
const TONES: Record<number, StatusTone> = {
  [STATUT_EN_COURS]: 'yellow',
  [STATUT_CLOTURE]: 'success',
  // STATUT_OUVERT → repli neutral
}
export function statutEvenementTone(id: number): StatusTone {
  return statusToneById(id, TONES)
}
