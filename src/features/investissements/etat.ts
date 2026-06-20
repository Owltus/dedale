import type { StepperStep } from '@/components/common/status-stepper'

/** Étape de frise enrichie du statut CapEx qu'elle représente (pour le clic). */
export interface InvestissementEtape extends StepperStep {
  statutId: number
}

// Parcours CapEx (ids du seed `statuts_capex`), dans l'ORDRE narratif d'affichage :
// Demandé(1) → À l'étude(5) → Validé(2) → Engagé(6) → Réalisé(3) → Clôturé(7).
// Refusé(4) = issue défavorable, hors du parcours linéaire.
// Le statut reste LIBRE côté base (pas de machine à états) : la frise n'est
// qu'une lecture visuelle de l'avancement, jamais une contrainte. L'ordre vit
// ici (présentation) — les ids ne sont volontairement PAS monotones (statuts
// ajoutés après coup) → l'état se calcule par POSITION, pas par valeur d'id.
const PARCOURS_IDS = [1, 5, 2, 6, 3, 7] as const
/** Statut « Refusé » (issue défavorable, hors parcours linéaire). */
export const ID_REFUSE = 4
const LABELS_DEFAUT: Record<number, string> = {
  1: 'Demandé',
  5: "À l'étude",
  2: 'Validé',
  6: 'Engagé',
  3: 'Réalisé',
  7: 'Clôturé',
  4: 'Refusé',
}

/**
 * Libellé d'un statut CapEx : référentiel (suit un renommage), sinon défaut, sinon
 * « Statut N ». Mutualisé entre la liste et la fiche → un badge ne disparaît plus
 * au premier rendu tant que `statuts_capex` n'est pas résolu (repli LABELS_DEFAUT).
 */
export function nomStatutCapex(id: number, noms: Map<number, string>): string {
  return noms.get(id) ?? LABELS_DEFAUT[id] ?? `Statut ${String(id)}`
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
 * Renvoie `null` si le statut n'appartient ni au parcours ni au refus (cas
 * théorique : le seed `statuts_capex` couvre 1-7) → la frise n'est alors pas
 * affichée. Statut LIBRE : toutes les étapes du parcours sont actionnables.
 */
export function etapesInvestissement(
  statutId: number,
  noms: Map<number, string>,
): InvestissementEtape[] | null {
  const nom = (id: number) => nomStatutCapex(id, noms)

  // Statut LIBRE (aucune machine à états) → toute étape du parcours est
  // actionnable (clic = on positionne ce statut), sauf l'étape courante.
  if (statutId === ID_REFUSE) {
    // Refusé : frise minimale, en lecture seule. La sortie du refus
    // (réactivation) se fait via le bouton dédié, pas par la frise.
    return [
      { label: nom(1), state: 'done', statutId: 1, actionable: false },
      {
        label: nom(ID_REFUSE),
        state: 'rejected',
        statutId: ID_REFUSE,
        actionable: false,
      },
    ]
  }

  const idx = PARCOURS_IDS.indexOf(statutId as (typeof PARCOURS_IDS)[number])
  if (idx === -1) return null

  // Dernier statut du parcours atteint → frise entièrement franchie (✓),
  // l'investissement se lit comme accompli (et non « en cours »).
  const dernier = PARCOURS_IDS.length - 1
  return PARCOURS_IDS.map((id, i) => ({
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
    // Libre : toutes les étapes sont cliquables sauf celle déjà active.
    actionable: i !== idx,
  }))
}
