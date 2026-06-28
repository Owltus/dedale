import {
  niveauUrgenceOt,
  NIVEAU_URGENCE,
  statutAffichageOt,
  type StatutAffichage,
} from '@/features/ordres-travail/statut-affichage'
import { trierOtParUrgence, type OtTriable } from '@/features/ordres-travail/tri'

/**
 * Statut d'AFFICHAGE d'une gamme (libellé + couleur de pastille `StatusBadge`) :
 * SYNTHÈSE PRIORISÉE de l'état de tous ses OT — le badge remonte toujours
 * l'information la plus urgente (gamme désactivée → « Inactive » ; aucun OT → « Non
 * assigné » ; sinon le badge de l'OT le plus urgent, cf. `statutDuPireOt`).
 *
 * 100 % dérivé des OT (aucune table, aucun compteur backend) : recalculé à chaque
 * rendu → toujours juste, exactement comme les statuts temporels d'OT.
 */
/** Une gamme vue par la synthèse d'une sous-catégorie : son activité + ses OT. */
export interface GammeStatutInput {
  estActive: boolean
  ots: OtTriable[]
}

/**
 * Statut d'affichage du PIRE OT (le plus urgent) d'un ensemble — cœur PARTAGÉ par la
 * synthèse d'une gamme ET d'un conteneur. Deux nuances « niveau synthèse » que le badge
 * d'un OT seul n'a pas :
 *   • le plus urgent est terminal (clôturé/annulé) → TOUS le sont → « À jour » (vert) ;
 *   • le prochain OT planifié est encore HORS fenêtre de tolérance (repli non temporel,
 *     rien d'imminent) → « À jour » (vert).
 * `top` absent (aucun OT) → « Non assigné ».
 */
function statutDuPireOt(
  top: OtTriable | undefined,
  aujourdHui?: Date,
): StatutAffichage {
  if (!top) return { label: 'Non assigné', tone: 'neutral', temporel: false }
  if (top.statut === 'cloture' || top.statut === 'annule')
    return { label: 'À jour', tone: 'success', temporel: false }

  const aff = statutAffichageOt({
    statut: top.statut,
    origine: top.origine,
    datePrevue: top.date_prevue,
    toleranceJours: top.tolerance_jours,
    aujourdHui,
  })
  if (top.statut === 'planifie' && !aff.temporel)
    return { label: 'À jour', tone: 'success', temporel: false }

  // Sinon on remonte tel quel l'état le plus urgent (Réouvert / En retard /
  // En cours / Cette semaine / Semaine prochaine / Ce mois-ci / Mois prochain).
  return aff
}

export function statutAffichageGamme(input: {
  estActive: boolean
  ots: OtTriable[]
  /** Aujourd'hui (injectable pour les tests) ; défaut = maintenant (via `statutAffichageOt`). */
  aujourdHui?: Date
}): StatutAffichage {
  if (!input.estActive) return { label: 'Inactive', tone: 'neutral', temporel: false }
  if (input.ots.length === 0)
    return { label: 'Non assigné', tone: 'neutral', temporel: false }

  // OT le plus urgent (le tri place le groupe prioritaire en tête).
  return statutDuPireOt(trierOtParUrgence(input.ots)[0], input.aujourdHui)
}

/**
 * Statut d'AFFICHAGE AGRÉGÉ d'un CONTENEUR de gammes (SOUS-CATÉGORIE *ou* CATÉGORIE) :
 * synthèse du PIRE CAS parmi toutes les gammes du périmètre. MÊME grille de lecture
 * que la gamme (mêmes libellés, mêmes couleurs) ; seul le PÉRIMÈTRE change —
 * l'appelant fournit l'ensemble des gammes concernées :
 *   • sous-catégorie → ses gammes directes ;
 *   • catégorie      → toutes les gammes de toutes ses sous-catégories.
 * On applique la règle de la gamme à TOUS leurs OT actifs réunis (« super-gamme »).
 * Cascade :
 *
 *   1. Aucune gamme                  → « Vide »        (gris)
 *   2. Toutes les gammes désactivées → « Inactive »    (gris)
 *   3-5. Un OT URGENT où que ce soit  → ce statut (En retard / Réouvert / En cours),
 *        avec la MÊME priorité que la gamme (Réouvert > En retard > En cours).
 *   6. Au moins une gamme active SANS OT → « À assigner » (gris)
 *   7-8. Sinon : proximité du prochain OT du périmètre, ou « À jour » (vert).
 *
 * 100 % dérivé des OT (aucune table) — recalculé à chaque rendu. C'est cette règle
 * unique appliquée à des périmètres de plus en plus larges (gamme → sous-catégorie →
 * catégorie) qui rend l'affichage cohérent sur toute la hiérarchie.
 */
export function statutAffichageAgrege(input: {
  gammes: GammeStatutInput[]
  /** Aujourd'hui (injectable pour les tests). */
  aujourdHui?: Date
}): StatutAffichage {
  // 1. Aucune gamme.
  if (input.gammes.length === 0)
    return { label: 'Vide', tone: 'neutral', temporel: false }

  // 2. Toutes les gammes désactivées.
  const actives = input.gammes.filter((g) => g.estActive)
  if (actives.length === 0)
    return { label: 'Inactive', tone: 'neutral', temporel: false }

  // « Super-gamme » : le pire OT de TOUTES les gammes actives réunies, via la MÊME
  // règle que la gamme (trierOtParUrgence + statutDuPireOt).
  const ots = actives.flatMap((g) => g.ots)
  const top = trierOtParUrgence(ots)[0]
  const pire = statutDuPireOt(top, input.aujourdHui)

  // 3-5. États réellement URGENTS (à traiter maintenant) — priment sur « À assigner ».
  // SEUIL sur le NIVEAU D'URGENCE STRUCTUREL du pire OT (Réouvert / En retard / En
  // cours = niveau ≤ En cours), plus aucun détour par la couleur du badge : la
  // proximité (Cette semaine / Ce mois-ci…) reste « à venir », donc non urgente.
  if (
    top !== undefined &&
    niveauUrgenceOt(top, input.aujourdHui) <= NIVEAU_URGENCE.enCours
  )
    return pire

  // 6. À assigner : au moins une gamme active n'a aucun OT (rien à suivre dessus).
  if (actives.some((g) => g.ots.length === 0))
    return { label: 'À assigner', tone: 'neutral', temporel: false }

  // 7-8. Proximité du prochain OT (Cette semaine / …), ou « À jour » (vert).
  return pire
}
