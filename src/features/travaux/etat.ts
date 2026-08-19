import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'
import {
  construireEtapes,
  type EtapeStatut,
} from '@/components/common/status-steps'
import { STATUT_OUVERT, STATUT_EN_COURS, STATUT_TERMINE } from './schemas'

/**
 * Parcours d'AFFICHAGE de la frise : Ouvert → En cours → Terminé.
 *
 * 085 : aucune machine à états côté base (comme les événements) — les
 * transitions sont LIBRES, toute pastille est donc cliquable. La frise sert
 * de lecture et de raccourci, elle ne contraint rien.
 */
const PARCOURS = [STATUT_OUVERT, STATUT_EN_COURS, STATUT_TERMINE] as const

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

/**
 * Construit la frise de suivi d'un travaux depuis son statut courant et le
 * référentiel des statuts (id → nom). Toutes les étapes sont actionnables :
 * le cycle est libre, on peut rouvrir un travaux terminé. Renvoie `null` si
 * le statut est inconnu → l'appelant retombe sur un badge.
 */
export function etapesTravaux(
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
