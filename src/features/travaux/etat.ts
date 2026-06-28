import type { StepperStep } from '@/components/common/status-stepper'
import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'
import {
  STATUT_OUVERT,
  STATUT_PLANIFIE,
  STATUT_EN_COURS,
  STATUT_TERMINE,
  STATUT_ANNULE,
  TRANSITIONS,
} from './schemas'

// Parcours linéaire d'AFFICHAGE de la frise : Ouvert → Planifié → En cours →
// Terminé. « Annulé » = issue défavorable terminale, hors parcours (proposé via
// un bouton dédié, pas une pastille). La machine à états réelle (transitions
// autorisées) vit dans `schemas.ts` (miroir du trigger backend) ; la frise n'est
// qu'une lecture visuelle + un raccourci de transition.
const PARCOURS = [
  STATUT_OUVERT,
  STATUT_PLANIFIE,
  STATUT_EN_COURS,
  STATUT_TERMINE,
] as const

/** Étape de frise enrichie du statut qu'elle représente (pour le clic). */
export interface TravauxEtape extends StepperStep {
  statutId: number
}

/**
 * Statuts TERMINAUX d'un travaux (Terminé, Annulé) : exclus par défaut du filtre
 * « Non terminés » des listes (cf. `matchStatutFilter`).
 */
export const STATUTS_TRAVAUX_TERMINAUX = [STATUT_TERMINE, STATUT_ANNULE] as const

/**
 * Code couleur (tone) d'un statut de travaux, pour la pastille `StatusBadge` et
 * le liseré de card : Ouvert = gris, Planifié = violet, En cours = jaune,
 * Terminé = vert, Annulé = gris atténué (issue terminale, le libellé distingue).
 */
const TONES: Record<number, StatusTone> = {
  [STATUT_PLANIFIE]: 'violet',
  [STATUT_EN_COURS]: 'yellow',
  [STATUT_TERMINE]: 'success',
  [STATUT_ANNULE]: 'neutral', // issue terminale, le libellé distingue
  // STATUT_OUVERT → repli neutral
}
export function statutTravauxTone(id: number): StatusTone {
  return statusToneById(id, TONES)
}

/**
 * Construit la frise de suivi d'un travaux depuis son statut courant et le
 * référentiel des statuts (id → nom). Chaque étape porte son `statutId` et un
 * flag `actionable` = transition autorisée depuis le statut courant (miroir de
 * `TRANSITIONS`) → la frise sert aussi de raccourci pour changer de statut.
 * Renvoie `null` si le statut est inconnu → l'appelant retombe sur un badge.
 */
export function etapesTravaux(
  statutId: number,
  noms: Map<number, string>,
): TravauxEtape[] | null {
  const nom = (id: number) => noms.get(id) ?? `Statut ${String(id)}`
  const transitions = TRANSITIONS[statutId] ?? []

  // Annulé : on n'a pas l'historique du statut précédent → frise minimale
  // (départ franchi puis issue défavorable). Terminal → rien d'actionnable.
  if (statutId === STATUT_ANNULE) {
    return [
      {
        label: nom(STATUT_OUVERT),
        state: 'done',
        statutId: STATUT_OUVERT,
        actionable: false,
      },
      {
        label: nom(STATUT_ANNULE),
        state: 'rejected',
        statutId: STATUT_ANNULE,
        actionable: false,
      },
    ]
  }

  const idx = PARCOURS.indexOf(statutId as (typeof PARCOURS)[number])
  if (idx === -1) return null

  // Dernier statut atteint (Terminé) → frise entièrement franchie (✓).
  const dernier = PARCOURS.length - 1
  return PARCOURS.map((id, i) => ({
    label: nom(id),
    statutId: id,
    state:
      i < idx
        ? 'done'
        : i === idx
          ? i === dernier
            ? 'done'
            : 'current'
          : 'upcoming',
    // Actionnable = transition autorisée (gère aussi la réouverture depuis
    // Terminé, où l'étape « En cours » est `done` mais reste cliquable).
    actionable: transitions.includes(id),
  }))
}
