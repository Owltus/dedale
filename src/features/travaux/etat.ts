import type { StepperStep } from '@/components/common/status-stepper'
import {
  STATUT_OUVERT,
  STATUT_PLANIFIE,
  STATUT_EN_COURS,
  STATUT_TERMINE,
  STATUT_ANNULE,
} from './schemas'

// Parcours linéaire d'AFFICHAGE de la frise : Ouvert → Planifié → En cours →
// Terminé. « Annulé » = issue défavorable terminale, hors parcours. La machine à
// états réelle (transitions autorisées) vit dans `schemas.ts` (miroir du trigger
// backend) ; la frise n'est qu'une lecture visuelle de l'avancement.
const PARCOURS = [
  STATUT_OUVERT,
  STATUT_PLANIFIE,
  STATUT_EN_COURS,
  STATUT_TERMINE,
] as const

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
 * référentiel des statuts (id → nom, pour suivre un éventuel renommage). Renvoie
 * `null` si le statut est inconnu → l'appelant retombe sur un simple badge.
 */
export function etapesTravaux(
  statutId: number,
  noms: Map<number, string>,
): StepperStep[] | null {
  const nom = (id: number) => noms.get(id) ?? `Statut ${String(id)}`

  // Annulé : on n'a pas l'historique du statut précédent → frise minimale
  // (départ franchi puis issue défavorable), à l'image des investissements refusés.
  if (statutId === STATUT_ANNULE) {
    return [
      { label: nom(STATUT_OUVERT), state: 'done' },
      { label: nom(STATUT_ANNULE), state: 'rejected' },
    ]
  }

  const idx = PARCOURS.indexOf(statutId as (typeof PARCOURS)[number])
  if (idx === -1) return null

  // Dernier statut atteint (Terminé) → frise entièrement franchie (✓), le
  // travaux se lit comme accompli (et non « en cours »).
  const dernier = PARCOURS.length - 1
  return PARCOURS.map((id, i) => ({
    label: nom(id),
    state:
      i < idx
        ? 'done'
        : i === idx
          ? i === dernier
            ? 'done'
            : 'current'
          : 'upcoming',
  }))
}
