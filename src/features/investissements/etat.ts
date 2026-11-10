import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

// QUATRE statuts (138, décision PO du 10/11/2026) : Demandé → Validé → Réalisé,
// ou Refusé. « Reporter » n'est pas un statut : c'est envoyer le dossier dans le
// budget de l'année suivante, où il redevient « Demandé ».
/** « Demandé » : départ, et point de retour d'une relance ou d'un report. */
export const ID_DEMANDE = 1
/** « Validé » : le budget est accordé. */
export const ID_VALIDE = 2
/** « Réalisé » : fait — porte la dépense réelle, la date et le bilan. */
export const ID_REALISE = 3
/** « Refusé » : motif obligatoire (CHECK capex_motif_arret_oblig_si_refuse). */
export const ID_REFUSE = 4

const LABELS_DEFAUT: Record<number, string> = {
  [ID_DEMANDE]: 'Demandé',
  [ID_VALIDE]: 'Validé',
  [ID_REALISE]: 'Réalisé',
  [ID_REFUSE]: 'Refusé',
}

/**
 * Libellé d'un statut : référentiel (suit un renommage), sinon défaut, sinon
 * « Statut N » — un badge ne disparaît pas tant que le référentiel charge.
 */
export function nomStatutCapex(id: number, noms: Map<number, string>): string {
  return noms.get(id) ?? LABELS_DEFAUT[id] ?? `Statut ${String(id)}`
}

/** Statuts TERMINÉS : masqués par le filtre « Non terminés ». */
export const STATUTS_CAPEX_TERMINAUX = [ID_REALISE, ID_REFUSE] as const

const TONES: Record<number, StatusTone> = {
  [ID_DEMANDE]: 'neutral', // en attente
  [ID_VALIDE]: 'violet', // feu vert
  [ID_REALISE]: 'success', // fait
  [ID_REFUSE]: 'destructive',
}
export function statutCapexTone(id: number): StatusTone {
  return statusToneById(id, TONES)
}

// Ordre LOGIQUE d'affichage (menu de filtre), indépendant des ids.
const ORDRE_AFFICHAGE: number[] = [ID_DEMANDE, ID_VALIDE, ID_REALISE, ID_REFUSE]

/** Rang d'affichage d'un statut (inconnu → en fin). */
export function rangStatutCapex(id: number): number {
  const i = ORDRE_AFFICHAGE.indexOf(id)
  return i === -1 ? ORDRE_AFFICHAGE.length : i
}

/** Ce que fait un bouton de la fiche. */
export type CleActionCapex =
  | 'valider'
  | 'refuser'
  | 'reporter'
  | 'realiser'
  | 'rouvrir'
  | 'relancer'

export interface ActionCapex {
  cle: CleActionCapex
  /** Texte du bouton — il dit seul ce qu'il fait. */
  libelle: string
  /** Statut après l'action. */
  statutId: number
  /** Année du budget après l'action. */
  annee: number
}

/**
 * Les boutons proposés sur la fiche selon le statut, l'action principale en
 * premier (138) :
 *   Demandé → Valider · Refuser · Reporter à N+1
 *   Validé  → Marquer réalisé · Reporter à N+1
 *   Réalisé → Rouvrir
 *   Refusé  → Relancer · Reporter à N+1
 */
export function actionsCapex(statutId: number, annee: number): ActionCapex[] {
  const reporter: ActionCapex = {
    cle: 'reporter',
    libelle: `Reporter à ${String(annee + 1)}`,
    statutId: ID_DEMANDE,
    annee: annee + 1,
  }
  const a = (
    cle: CleActionCapex,
    libelle: string,
    statut: number,
  ): ActionCapex => ({ cle, libelle, statutId: statut, annee })
  switch (statutId) {
    case ID_DEMANDE:
      return [
        a('valider', 'Valider', ID_VALIDE),
        a('refuser', 'Refuser', ID_REFUSE),
        reporter,
      ]
    case ID_VALIDE:
      return [a('realiser', 'Marquer réalisé', ID_REALISE), reporter]
    case ID_REALISE:
      return [a('rouvrir', 'Rouvrir', ID_VALIDE)]
    case ID_REFUSE:
      return [a('relancer', 'Relancer', ID_DEMANDE), reporter]
    default:
      return []
  }
}

/**
 * Années de budget à afficher, de la plus récente à la plus ancienne : celles
 * qui ont des dossiers, plus l'année en cours et la suivante (pour pouvoir y
 * créer une demande même vide).
 */
export function anneesBudget(
  annees: readonly number[],
  anneeCourante: number,
): number[] {
  return [...new Set([...annees, anneeCourante, anneeCourante + 1])].sort(
    (a, b) => b - a,
  )
}

export interface TotauxAnnee {
  nb: number
  /** Somme des montants demandés, refus exclus. */
  demande: number
  /** Somme des dossiers validés ou réalisés (dépense réelle, sinon prévu, sinon demandé). */
  valide: number
}

/** Totaux d'une année de budget (décision PO : pas d'enveloppe, les totaux seuls). */
export function totauxAnnee(
  invs: readonly Pick<
    Investissement,
    'statut_capex_id' | 'montant_demande' | 'montant_prevu' | 'depense_reelle'
  >[],
): TotauxAnnee {
  let demande = 0
  let valide = 0
  for (const i of invs) {
    if (i.statut_capex_id !== ID_REFUSE) demande += i.montant_demande ?? 0
    if (i.statut_capex_id === ID_VALIDE || i.statut_capex_id === ID_REALISE)
      valide += i.depense_reelle ?? i.montant_prevu ?? i.montant_demande ?? 0
  }
  return { nb: invs.length, demande, valide }
}

/** État d'une étape du schéma de la fiche. */
export type EtatEtapeCapex = 'fait' | 'actuel' | 'avenir'

export interface EtapeSchemaCapex {
  statutId: number
  libelle: string
  etat: EtatEtapeCapex
}

export interface FlecheSchemaCapex {
  /** L'action qui fait passer d'une étape à la suivante. */
  libelle: string
  franchie: boolean
}

/**
 * SCHÉMA DE LA FICHE (138, demande PO : « à la Mermaid », flèches, refus
 * ignoré) : Demandé → Valider → Validé → Marquer réalisé → Réalisé. L'étape du
 * dossier est `actuel` ; un dossier refusé (hors schéma) n'en allume aucune —
 * son badge le dit.
 */
export function schemaCapex(
  statutId: number,
  noms: Map<number, string>,
): { etapes: EtapeSchemaCapex[]; fleches: FlecheSchemaCapex[] } {
  const ids = [ID_DEMANDE, ID_VALIDE, ID_REALISE]
  const rang = ids.indexOf(statutId)
  return {
    etapes: ids.map((id, i) => ({
      statutId: id,
      libelle: nomStatutCapex(id, noms),
      etat: rang === -1 || i > rang ? 'avenir' : i < rang ? 'fait' : 'actuel',
    })),
    fleches: ['Valider', 'Marquer réalisé'].map((libelle, i) => ({
      libelle,
      franchie: rang !== -1 && i < rang,
    })),
  }
}
