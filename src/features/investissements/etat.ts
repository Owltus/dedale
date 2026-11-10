import {
  construireEtapes,
  type EtapeStatut,
} from '@/components/common/status-steps'
import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'

// Parcours CapEx (ids du seed `statuts_capex`), dans l'ORDRE narratif d'affichage :
// Demandé(1) → Accordé(5, par le responsable) → Validé(2, par la direction) →
// Engagé(6) → Réalisé(3) → Clôturé(7). Issues hors parcours : Refusé(4),
// Annulé(8), Reporté(9) — 137, demande PO du 10/11/2026.
// Le statut reste LIBRE côté base (pas de machine à états) : la frise n'est
// qu'une lecture visuelle de l'avancement, jamais une contrainte. L'ordre vit
// ici (présentation) — les ids ne sont volontairement PAS monotones (statuts
// ajoutés après coup) → l'état se calcule par POSITION, pas par valeur d'id.
const PARCOURS_IDS = [1, 5, 2, 6, 3, 7] as const
/**
 * Statut « Refusé » (issue défavorable, hors parcours linéaire) : la décision
 * d'arbitrage a dit non. Arrive tôt — Demandé ou À l'étude.
 */
export const ID_REFUSE = 4
/**
 * Statut « Annulé » (121) : le projet est ABANDONNÉ en cours de route — local
 * réaffecté, fournisseur défaillant, budget basculé. À distinguer du refus :
 * l'annulation peut survenir à tout moment, y compris après « Validé » ou
 * « Engagé ». Les deux exigent un motif (CHECK
 * capex_motif_arret_oblig_si_refuse_ou_annule).
 */
export const ID_ANNULE = 8
/**
 * Statut « Clôturé » : FIN du parcours, et le seul qui porte un bilan.
 * « Réalisé »(3) reste une étape — les dépenses peuvent encore bouger.
 */
export const ID_CLOTURE = 7
/** « Demandé » : départ du parcours, et point de retour d'une relance. */
export const ID_DEMANDE = 1
/** « Accordé » (137) : le responsable a dit oui, la direction doit décider. */
export const ID_ACCORDE = 5
/** « Validé » : la direction a dit oui (notée par le responsable, 137). */
export const ID_VALIDE = 2
/**
 * « Reporté » (137) : la décision est repoussée à plus tard, par le
 * responsable ou la direction. Motif obligatoire, sans échéance (PO).
 */
export const ID_REPORTE = 9
const LABELS_DEFAUT: Record<number, string> = {
  1: 'Demandé',
  5: 'Accordé',
  2: 'Validé',
  6: 'Engagé',
  3: 'Réalisé',
  7: 'Clôturé',
  4: 'Refusé',
  8: 'Annulé',
  9: 'Reporté',
}

/**
 * Libellé d'un statut CapEx : référentiel (suit un renommage), sinon défaut, sinon
 * « Statut N ». Mutualisé entre la liste et la fiche → un badge ne disparaît plus
 * au premier rendu tant que `statuts_capex` n'est pas résolu (repli LABELS_DEFAUT).
 */
export function nomStatutCapex(id: number, noms: Map<number, string>): string {
  return noms.get(id) ?? LABELS_DEFAUT[id] ?? `Statut ${String(id)}`
}

/**
 * Statuts TERMINAUX d'un investissement (Réalisé, Clôturé, Refusé) : exclus par
 * défaut du filtre « Non terminés » des listes (cf. `matchStatutFilter`).
 */
export const STATUTS_CAPEX_TERMINAUX = [3, 7, ID_REFUSE, ID_ANNULE] as const

/**
 * Code couleur (tone) LOGIQUE d'un statut CapEx, pour la pastille `StatusBadge`
 * et le liseré de card. Le cycle CapEx a sa propre lecture (≠ DI/Travaux) :
 *  Demandé = gris (en attente), À l'étude = bleu (analyse), Validé = violet
 *  (feu vert / jalon), Engagé = jaune (exécution en cours), Réalisé = vert
 *  (accompli), Clôturé = gris (dossier clos / archivé), Refusé = rouge.
 */
const TONES: Record<number, StatusTone> = {
  [ID_REFUSE]: 'destructive', // Refusé
  // Annulé = gris et non rouge : un abandon n'est pas un rejet. Le rouge doit
  // rester au refus d'arbitrage, sinon les deux issues se confondent au coup
  // d'œil — ce qui était justement la raison d'en faire deux statuts.
  [ID_ANNULE]: 'neutral', // Annulé (dossier abandonné)
  // Reporté = orange : rien n'est perdu, mais le dossier attend qu'on y revienne.
  [ID_REPORTE]: 'warning',
  5: 'info', // Accordé (par le responsable, attend la direction)
  2: 'violet', // Validé
  6: 'yellow', // Engagé
  3: 'success', // Réalisé
  7: 'neutral', // Clôturé (dossier clos / archivé)
  1: 'neutral', // Demandé (en attente)
}
export function statutCapexTone(id: number): StatusTone {
  return statusToneById(id, TONES)
}

// Ordre canonique d'AFFICHAGE des statuts : le parcours, puis Refusé en fin.
// Sert à trier le menu déroulant dans l'ordre LOGIQUE du cycle (≠ ordre des ids,
// ≠ alphabétique).
const ORDRE_AFFICHAGE: number[] = [
  ...PARCOURS_IDS,
  ID_REPORTE,
  ID_REFUSE,
  ID_ANNULE,
]

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
): EtapeStatut[] | null {
  return construireEtapes({
    parcours: PARCOURS_IDS,
    statutId,
    nom: (id) => nomStatutCapex(id, noms),
    // Statut LIBRE (aucune machine à états) → toute étape du parcours est
    // actionnable (clic = on positionne ce statut), sauf l'étape courante.
    actionable: (_id, i, idx) => i !== idx,
    // Refusé OU Annulé : frise minimale (départ Demandé franchi puis issue
    // défavorable), en lecture seule. La sortie passe par le bouton « Réactiver ».
    // La brique n'accepte qu'UNE issue défavorable — il suffit de lui passer
    // celle du statut courant, les deux ne pouvant pas coexister.
    rejected: {
      id: ISSUES_ARRET.includes(statutId) ? statutId : ID_REFUSE,
      departId: 1,
    },
  })
}

/** Issues qui arrêtent le parcours et exigent un motif (CHECK 121, étendu 137). */
export const ISSUES_ARRET: readonly number[] = [
  ID_REFUSE,
  ID_ANNULE,
  ID_REPORTE,
]

/** Qui a pris une décision (colonne `decision_par`, 137). */
export type DecisionPar = 'responsable' | 'direction'

export function libelleDecisionPar(par: DecisionPar): string {
  return par === 'direction' ? 'la direction' : 'moi'
}

/** Une décision proposée sur la fiche : le statut visé et qui la prend. */
export interface DecisionCapex {
  statutId: number
  par: DecisionPar | null
  libelle: string
}

/**
 * ARBRE DE DÉCISION (137, demande PO du 10/11/2026) : les choix proposés à
 * l'étape courante, dans l'ordre d'affichage (le « oui » d'abord).
 *   Demandé  → Accorder · Refuser · Reporter (par moi)
 *   Accordé  → Validé · Refusé · Reporté par la direction
 *   Validé   → Engager ; Engagé → Réalisé ; Réalisé → Clôturer
 *   Refusé / Reporté / Annulé → Relancer (retour à Demandé, historique gardé)
 * « Annuler » (abandon, à tout moment) reste en barre de titre. Le statut est
 * LIBRE côté base : cet arbre guide, la frise permet toujours de corriger.
 */
export function decisionsCapex(statutId: number): DecisionCapex[] {
  switch (statutId) {
    case ID_DEMANDE:
      return [
        { statutId: ID_ACCORDE, par: 'responsable', libelle: 'Accorder' },
        { statutId: ID_REFUSE, par: 'responsable', libelle: 'Refuser' },
        { statutId: ID_REPORTE, par: 'responsable', libelle: 'Reporter' },
      ]
    case ID_ACCORDE:
      return [
        {
          statutId: ID_VALIDE,
          par: 'direction',
          libelle: 'Validé par la direction',
        },
        {
          statutId: ID_REFUSE,
          par: 'direction',
          libelle: 'Refusé par la direction',
        },
        {
          statutId: ID_REPORTE,
          par: 'direction',
          libelle: 'Reporté par la direction',
        },
      ]
    case ID_VALIDE:
      return [{ statutId: 6, par: null, libelle: 'Commande passée (engager)' }]
    case 6:
      return [{ statutId: 3, par: null, libelle: 'Marquer réalisé' }]
    case 3:
      return [{ statutId: ID_CLOTURE, par: null, libelle: 'Clôturer' }]
    case ID_REFUSE:
    case ID_REPORTE:
    case ID_ANNULE:
      return [
        { statutId: ID_DEMANDE, par: null, libelle: 'Relancer la demande' },
      ]
    default:
      return []
  }
}

/**
 * Libellé d'une ligne d'historique : le statut atteint, et par qui quand c'est
 * une décision. Un retour à « Demandé » après coup est une RELANCE.
 */
export function libelleDecision(
  statutId: number,
  par: DecisionPar | null,
  noms: Map<number, string>,
  premiere: boolean,
): string {
  if (statutId === ID_DEMANDE) return premiere ? 'Demandé' : 'Relancé'
  const nom = nomStatutCapex(statutId, noms)
  return par ? `${nom} par ${libelleDecisionPar(par)}` : nom
}
