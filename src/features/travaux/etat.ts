import type { StepperStep } from '@/components/common/status-stepper'
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

/** Variante de `Badge` cohérente pour un statut de travaux. */
export function variantStatutTravaux(
  id: number,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (id) {
    case STATUT_ANNULE:
      return 'destructive'
    case STATUT_TERMINE:
      return 'default'
    case STATUT_OUVERT:
      return 'outline'
    default: // Planifié, En cours
      return 'secondary'
  }
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
