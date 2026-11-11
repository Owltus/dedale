import {
  statusToneById,
  type StatusTone,
} from '@/components/common/status-badge'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

/** Ce qui compte d'un devis pour le montant d'un projet (147). */
export interface DevisMontant {
  montant_ht: number
  retenu: boolean
}

/** Ce qui compte d'un projet pour son montant : son statut, son réel, ses devis. */
export type ProjetMontant = Pick<
  Investissement,
  'statut_capex_id' | 'depense_reelle'
> & { devis: readonly DevisMontant[] }

const centimes = (x: number) => Math.round(x * 100) / 100

/**
 * Montant RETENU d'un projet (147) : la somme des devis retenus, sinon — rien
 * de retenu — le devis le moins cher ; null sans aucun devis.
 */
export function montantRetenu(p: Pick<ProjetMontant, 'devis'>): number | null {
  const retenus = p.devis.filter((d) => d.retenu)
  if (retenus.length > 0)
    return centimes(retenus.reduce((s, d) => s + d.montant_ht, 0))
  if (p.devis.length === 0) return null
  return Math.min(...p.devis.map((d) => d.montant_ht))
}

/**
 * LE montant d'un projet (décisions PO du 11/11/2026), partout — barre,
 * listes, fiche : les devis RETENUS (pré-sélectionnés dans le schéma ou
 * validés), sinon le devis le moins cher ; une fois réalisé, la dépense
 * réelle prime. null quand le projet n'a encore aucun devis.
 */
export function montantProjet(p: ProjetMontant): number | null {
  if (p.statut_capex_id === ID_REALISE)
    return p.depense_reelle ?? montantRetenu(p)
  return montantRetenu(p)
}

// QUATRE statuts (138, décision PO du 10/11/2026) : Demandé → Validé → Réalisé,
// ou Refusé. « Reporter » n'est pas un statut : c'est envoyer le dossier dans le
// budget de l'année suivante, où il redevient « Proposition ».
/** « Proposition » : départ, et point de retour d'une relance ou d'un report. */
export const ID_DEMANDE = 1
/** « Validé » : le budget est accordé. */
export const ID_VALIDE = 2
/** « Réalisé » : fait — porte la dépense réelle, la date et le bilan. */
export const ID_REALISE = 3
/** « Refusé » : date du refus, motif facultatif (145). */
export const ID_REFUSE = 4

const LABELS_DEFAUT: Record<number, string> = {
  [ID_DEMANDE]: 'Proposition',
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
  // Couleurs du parcours (demande PO du 10/11/2026) : tout le chemin validé
  // est VERT (validé, puis réalisé), le refus ROUGE ; le report, jaune, n'est
  // pas un statut et n'apparaît que sur le schéma.
  [ID_DEMANDE]: 'neutral', // en attente
  [ID_VALIDE]: 'success', // feu vert
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

/**
 * Le budget qu'on PRÉPARE (demande PO du 10/11/2026) : en 2026, on fait le
 * budget 2027 — les demandes de l'année vont au budget de l'année suivante.
 */
export function anneeBudgetEnPreparation(aujourdhui = new Date()): number {
  return aujourdhui.getFullYear() + 1
}

/**
 * Années de budget à afficher, de la plus récente à la plus ancienne : celles
 * qui ont des dossiers, plus le budget en préparation, toujours présent même
 * vide (demande PO). Les autres années n'apparaissent qu'avec des dossiers —
 * N+2 naît du premier report.
 */
export function anneesBudget(
  annees: readonly number[],
  enPreparation: number,
): number[] {
  return [...new Set([...annees, enPreparation])].sort((a, b) => b - a)
}

export interface TotauxAnnee {
  nb: number
  /** Somme des projets non refusés (montant de chaque projet). */
  demande: number
  /** Somme des projets validés ou réalisés. */
  valide: number
}

/** Totaux d'une année de budget (décision PO : pas d'enveloppe, les totaux seuls). */
export function totauxAnnee(invs: readonly ProjetMontant[]): TotauxAnnee {
  let demande = 0
  let valide = 0
  for (const i of invs) {
    const m = montantProjet(i) ?? 0
    if (i.statut_capex_id !== ID_REFUSE) demande += m
    if (i.statut_capex_id === ID_VALIDE || i.statut_capex_id === ID_REALISE)
      valide += m
  }
  return {
    nb: invs.length,
    demande: centimes(demande),
    valide: centimes(valide),
  }
}

/** Ce que fait un clic sur une case du schéma. */
export type CleActionCapex =
  | 'valider'
  | 'refuser'
  | 'reporter'
  | 'realiser'
  | 'rouvrir'
  | 'relancer'

export interface ActionCapex {
  cle: CleActionCapex
  /** Statut après l'action. */
  statutId: number
  /** Année du budget après l'action (report = +1). */
  annee: number
}

/** Où en est une case : passée (cochée), celle du dossier, ou ailleurs. */
export type EtatCaseCapex = 'fait' | 'actuel' | 'libre'

export interface CaseCapex {
  libelle: string
  /** Statut que la case représente (`null` pour le report, qui n'en est pas un). */
  statutId: number | null
  etat: EtatCaseCapex
  /**
   * Le clic sur la case ; `null` = non cliquable (la case du dossier, sauf
   * Réalisé / Refusé qui y rouvrent leur fenêtre de correction).
   */
  action: ActionCapex | null
}

/** Une flèche : empruntée par le dossier (`ok` / `refus`) ou non. */
export type EtatFlecheCapex = 'ok' | 'refus' | 'libre'

export interface SchemaCapex {
  demande: CaseCapex
  valide: CaseCapex
  realise: CaseCapex
  refuse: CaseCapex
  reporte: CaseCapex
  fleches: {
    versValide: EtatFlecheCapex
    versRefuse: EtatFlecheCapex
    versReporte: EtatFlecheCapex
    versRealise: EtatFlecheCapex
  }
}

/**
 * SCHÉMA VERTICAL DE LA FICHE (138, demande PO du 10/11/2026) — façon
 * organigramme Mermaid, de haut en bas :
 *
 *                     Demandé
 *            ┌───────────┼───────────┐
 *         Refusé       Validé     Reporter à N+1
 *                        │
 *                     Réalisé
 *
 * La case du dossier est `actuel` ; un CLIC sur une autre case y fait passer
 * le dossier (statut libre côté base). Le report n'est pas un statut : sa case
 * envoie le dossier dans le budget de l'année suivante, en « Proposition ».
 */
export function schemaCapex(
  statutId: number,
  annee: number,
  noms: Map<number, string>,
): SchemaCapex {
  const valideOuPlus = statutId === ID_VALIDE || statutId === ID_REALISE
  const etat = (id: number, fait: boolean): EtatCaseCapex =>
    id === statutId ? 'actuel' : fait ? 'fait' : 'libre'
  const action = (
    id: number,
    cle: CleActionCapex,
    a = annee,
  ): ActionCapex | null =>
    id === statutId ? null : { cle, statutId: id, annee: a }
  const connu = [ID_DEMANDE, ID_VALIDE, ID_REALISE, ID_REFUSE].includes(
    statutId,
  )
  return {
    demande: {
      libelle: nomStatutCapex(ID_DEMANDE, noms),
      statutId: ID_DEMANDE,
      etat: etat(ID_DEMANDE, connu),
      action: action(ID_DEMANDE, 'relancer'),
    },
    valide: {
      libelle: nomStatutCapex(ID_VALIDE, noms),
      statutId: ID_VALIDE,
      etat: etat(ID_VALIDE, statutId === ID_REALISE),
      // Case du dossier validé : cliquable aussi, pour CORRIGER la date de
      // validation (146) — comme Réalisé et Refusé.
      action:
        statutId === ID_VALIDE
          ? { cle: 'valider', statutId: ID_VALIDE, annee }
          : action(ID_VALIDE, statutId === ID_REALISE ? 'rouvrir' : 'valider'),
    },
    // Réalisé / Refusé : même la case du dossier reste cliquable — elle
    // rouvre sa fenêtre pour CORRIGER (date, dépense, bilan / motif). C'est le
    // seul accès quand le bilan est vide (pas de carte « Réalisation » alors).
    realise: {
      libelle: nomStatutCapex(ID_REALISE, noms),
      statutId: ID_REALISE,
      etat: etat(ID_REALISE, false),
      action: { cle: 'realiser', statutId: ID_REALISE, annee },
    },
    refuse: {
      libelle: nomStatutCapex(ID_REFUSE, noms),
      statutId: ID_REFUSE,
      etat: etat(ID_REFUSE, false),
      action: { cle: 'refuser', statutId: ID_REFUSE, annee },
    },
    reporte: {
      libelle: `Reporter à ${String(annee + 1)}`,
      statutId: null,
      etat: 'libre',
      action: { cle: 'reporter', statutId: ID_DEMANDE, annee: annee + 1 },
    },
    fleches: {
      versValide: valideOuPlus ? 'ok' : 'libre',
      versRefuse: statutId === ID_REFUSE ? 'refus' : 'libre',
      versReporte: 'libre',
      versRealise: statutId === ID_REALISE ? 'ok' : 'libre',
    },
  }
}

/** Ligne de l'historique des décisions (journal 138) utile aux dates. */
export type DecisionCapex = Pick<
  Database['public']['Tables']['investissements_decisions']['Row'],
  'statut_capex_id' | 'annee_budget' | 'created_at'
>

/** Dates affichées dans les cases du schéma (ISO), quand elles existent. */
export interface DatesCapex {
  demande: string | null
  valide: string | null
  realise: string | null
  refuse: string | null
  /** Dernier report qui a amené le dossier dans son année actuelle. */
  reporte: { date: string; depuis: number } | null
}

/**
 * Dates du parcours d'un dossier. Une date n'est donnée que si l'étape est
 * VRAIE aujourd'hui : la date de validation d'un dossier refusé depuis ne
 * s'affiche pas. Demande, réalisation et refus viennent de la fiche ; la
 * validation et le report, du journal des décisions (trié ou non).
 */
export function datesCapex(
  inv: Pick<
    Investissement,
    | 'statut_capex_id'
    | 'annee_budget'
    | 'date_demande'
    | 'date_cloture'
    | 'date_arret'
    | 'date_validation'
  >,
  decisions: readonly DecisionCapex[],
): DatesCapex {
  const journal = [...decisions].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )
  const statut = inv.statut_capex_id
  const valideOuPlus = statut === ID_VALIDE || statut === ID_REALISE
  const derniere = (id: number) =>
    journal.findLast((d) => d.statut_capex_id === id)?.created_at ?? null

  let reporte: DatesCapex['reporte'] = null
  for (let i = 1; i < journal.length; i++) {
    const avant = journal[i - 1]?.annee_budget
    const apres = journal[i]
    if (
      apres &&
      avant != null &&
      apres.annee_budget === inv.annee_budget &&
      avant < inv.annee_budget
    )
      reporte = { date: apres.created_at, depuis: avant }
  }

  return {
    demande: inv.date_demande,
    // Date saisie (146), sinon celle du journal (dossiers d'avant 146).
    valide: valideOuPlus ? (inv.date_validation ?? derniere(ID_VALIDE)) : null,
    realise: statut === ID_REALISE ? inv.date_cloture : null,
    refuse:
      statut === ID_REFUSE ? (inv.date_arret ?? derniere(ID_REFUSE)) : null,
    reporte,
  }
}

/** Une part de la barre d'un budget : un statut, son montant et ses dossiers. */
export interface PartBudget {
  statutId: number
  montant: number
  nb: number
}

/**
 * Répartition d'un budget par statut, pour sa barre (demande PO du
 * 10/11/2026), dans l'ordre du parcours : Réalisé, Validé, Proposition,
 * Refusé. Montant d'un projet = `montantProjet`. Les statuts sans projet
 * sont omis.
 */
export function repartitionBudget(
  invs: readonly ProjetMontant[],
): PartBudget[] {
  const ordre = [ID_REALISE, ID_VALIDE, ID_DEMANDE, ID_REFUSE]
  const parts = new Map(
    ordre.map((id) => [id, { statutId: id, montant: 0, nb: 0 }]),
  )
  for (const i of invs) {
    const p = parts.get(i.statut_capex_id)
    if (!p) continue
    p.nb += 1
    p.montant = centimes(p.montant + (montantProjet(i) ?? 0))
  }
  return ordre.flatMap((id) => {
    const p = parts.get(id)
    return p && p.nb > 0 ? [p] : []
  })
}
