import type { StepperStep } from '@/components/common/status-stepper'

// Parcours CapEx (ids du seed `statuts_capex`), dans l'ORDRE narratif d'affichage :
// Demandé(1) → À l'étude(5) → Validé(2) → Engagé(6) → Réalisé(3) → Clôturé(7).
// Refusé(4) = issue défavorable, hors du parcours linéaire.
// Le statut reste LIBRE côté base (pas de machine à états) : la frise n'est
// qu'une lecture visuelle de l'avancement, jamais une contrainte. L'ordre vit
// ici (présentation) — les ids ne sont volontairement PAS monotones (statuts
// ajoutés après coup) → l'état se calcule par POSITION, pas par valeur d'id.
const PARCOURS_IDS = [1, 5, 2, 6, 3, 7] as const
const ID_REFUSE = 4
const LABELS_DEFAUT: Record<number, string> = {
  1: 'Demandé',
  5: "À l'étude",
  2: 'Validé',
  6: 'Engagé',
  3: 'Réalisé',
  7: 'Clôturé',
  4: 'Refusé',
}

/** Variante de `Badge` cohérente pour un statut CapEx. */
export function variantStatutCapex(
  id: number,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (id) {
    case ID_REFUSE:
      return 'destructive'
    case 3: // Réalisé
    case 7: // Clôturé
      return 'default'
    case 1: // Demandé
      return 'outline'
    default: // À l'étude, Validé, Engagé
      return 'secondary'
  }
}

// Ordre canonique d'AFFICHAGE des statuts : le parcours, puis Refusé en fin.
// Sert à trier le menu déroulant dans l'ordre LOGIQUE du cycle (≠ ordre des ids,
// ≠ alphabétique).
const ORDRE_AFFICHAGE: number[] = [...PARCOURS_IDS, ID_REFUSE]

/** Rang d'affichage d'un statut CapEx (statut inconnu → rejeté en fin). */
export function rangStatutCapex(id: number): number {
  const i = ORDRE_AFFICHAGE.indexOf(id)
  return i === -1 ? ORDRE_AFFICHAGE.length : i
}

/**
 * Construit la frise de suivi d'un investissement depuis son statut courant et
 * le référentiel des statuts (id → nom, pour suivre un éventuel renommage).
 * Renvoie `null` si le statut n'appartient pas au parcours connu (statut
 * personnalisé) → l'appelant retombe sur un simple badge.
 */
export function etapesInvestissement(
  statutId: number,
  noms: Map<number, string>,
): StepperStep[] | null {
  const nom = (id: number) =>
    noms.get(id) ?? LABELS_DEFAUT[id] ?? `Statut ${String(id)}`

  if (statutId === ID_REFUSE) {
    return [
      { label: nom(1), state: 'done' },
      { label: nom(ID_REFUSE), state: 'rejected' },
    ]
  }

  const idx = PARCOURS_IDS.indexOf(statutId as (typeof PARCOURS_IDS)[number])
  if (idx === -1) return null

  // Dernier statut du parcours atteint → frise entièrement franchie (✓),
  // l'investissement se lit comme accompli (et non « en cours »).
  const dernier = PARCOURS_IDS.length - 1
  return PARCOURS_IDS.map((id, i) => ({
    label: nom(id),
    state:
      i < idx ? 'done' : i === idx ? (i === dernier ? 'done' : 'current') : 'upcoming',
  }))
}
