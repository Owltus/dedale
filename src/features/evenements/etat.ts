import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'
import {
  construireEtapes,
  type EtapeStatut,
} from '@/components/common/status-steps'
import { STATUT_OUVERT, STATUT_EN_COURS, STATUT_CLOTURE } from './schemas'

/**
 * Parcours d'AFFICHAGE de la frise : Ouvert → En cours → Clôturé.
 *
 * « En attente » a été retiré (migration 078) : à l'usage, il ne se distinguait
 * pas d'« En cours » — dans les deux cas l'événement est pris en charge et pas
 * encore réglé. Trois états se tiennent mieux qu'un quatrième dont on hésite à
 * savoir quand l'employer.
 *
 * Aucune machine à états côté base (comme les demandes d'intervention) : les
 * transitions sont LIBRES, toute pastille est donc cliquable. La frise sert de
 * lecture et de raccourci, elle ne contraint rien.
 */
const PARCOURS = [STATUT_OUVERT, STATUT_EN_COURS, STATUT_CLOTURE] as const

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

/**
 * Frise de suivi d'un événement. Toutes les étapes sont actionnables : le cycle
 * est libre, on peut rouvrir un événement clôturé ou le remettre en attente.
 * Renvoie `null` si le statut est inconnu → l'appelant retombe sur un badge.
 */
export function etapesEvenement(
  statutId: number,
  noms: Map<number, string>,
): EtapeStatut[] | null {
  return construireEtapes({
    parcours: PARCOURS,
    statutId,
    nom: (id) => noms.get(id) ?? `Statut ${String(id)}`,
    actionable: () => true,
  })
}
