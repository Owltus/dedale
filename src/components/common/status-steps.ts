import type { StepperStep } from '@/components/common/status-stepper'

/**
 * Étape de frise ENRICHIE du statut qu'elle représente (pour le clic = passage
 * vers ce statut). Type de retour commun aux frises de statut (travaux, CapEx…).
 */
export interface EtapeStatut extends StepperStep {
  statutId: number
}

interface ConstruireEtapesArgs {
  /**
   * Parcours d'AFFICHAGE (ids de statut dans l'ordre narratif). L'état de chaque
   * étape se calcule par POSITION, jamais par valeur d'id (ids non monotones).
   */
  parcours: readonly number[]
  /** Statut courant de l'entité. */
  statutId: number
  /** Libellé d'un statut (référentiel + repli propre à la feature). */
  nom: (id: number) => string
  /**
   * Étape ACTIONNABLE (clic autorisé). Reçoit l'id du statut, sa position et la
   * position du statut courant → couvre aussi bien une machine à états (miroir
   * des transitions autorisées) qu'un statut libre (`(_, i, idx) => i !== idx`).
   */
  actionable: (id: number, index: number, currentIndex: number) => boolean
  /**
   * Issue défavorable terminale HORS parcours (Annulé, Refusé…). Si le statut
   * courant vaut `rejected.id`, on renvoie une frise MINIMALE en lecture seule
   * (départ franchi → issue refusée), l'historique du statut précédent étant
   * inconnu. `departId` = première étape affichée (défaut : `parcours[0]`).
   */
  rejected?: { id: number; departId?: number }
}

/**
 * Construit la frise de suivi d'un statut : parcours positionnel → états
 * `done`/`current`/`upcoming` (le dernier statut atteint est `done`, pas
 * `current` → l'entité se lit comme accomplie), et frise minimale
 * « départ done + issue rejected » pour le statut refusé. Renvoie `null` si le
 * statut n'appartient ni au parcours ni au refus → l'appelant retombe sur un
 * badge. Algorithme partagé entre les `etat.ts` des features (l'ordre du cycle
 * et les règles d'actionnabilité restent propres à chaque feature).
 */
export function construireEtapes({
  parcours,
  statutId,
  nom,
  actionable,
  rejected,
}: ConstruireEtapesArgs): EtapeStatut[] | null {
  // Refusé : historique du statut précédent inconnu → frise minimale (départ
  // franchi puis issue défavorable). Terminal → rien d'actionnable.
  const rejectedId = rejected?.id
  if (rejectedId !== undefined && statutId === rejectedId) {
    const departId = rejected?.departId ?? parcours[0]
    // `parcours` non vide en pratique (le seed couvre le cycle) ; garde de type.
    if (departId === undefined) return null
    return [
      {
        label: nom(departId),
        state: 'done',
        statutId: departId,
        actionable: false,
      },
      {
        label: nom(rejectedId),
        state: 'rejected',
        statutId: rejectedId,
        actionable: false,
      },
    ]
  }

  const idx = parcours.indexOf(statutId)
  if (idx === -1) return null

  // Dernier statut du parcours atteint → frise entièrement franchie (✓).
  const dernier = parcours.length - 1
  return parcours.map((id, i) => ({
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
    actionable: actionable(id, i, idx),
  }))
}
