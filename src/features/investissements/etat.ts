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
export type ProjetMontant = Pick<Investissement, 'statut_capex_id'> & {
  devis: readonly DevisMontant[]
}

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
 * validés), sinon le devis le moins cher ; null sans aucun devis. Réalisé
 * compris : il n'y a pas de dépense réelle à part, « le montant réel, c'est
 * celui du devis ».
 */
export function montantProjet(p: ProjetMontant): number | null {
  return montantRetenu(p)
}

// QUATRE statuts (138, décision PO du 10/11/2026) : Demandé → Validé → Réalisé,
// ou Refusé. « Reporter » n'est pas un statut : c'est envoyer le dossier dans le
// budget de l'année suivante, où il redevient « Proposition ».
/** « Proposition » : départ, et point de retour d'une relance ou d'un report. */
export const ID_DEMANDE = 1
/**
 * « Confirmé » (ex-« Validé », 150) : le 2e accord, définitif — le budget est
 * accordé. On n'y arrive que depuis « Prévalidé » (demande PO du 12/11/2026).
 */
export const ID_VALIDE = 2
/** « Réalisé » : fait — porte la dépense réelle, la date et le bilan. */
export const ID_REALISE = 3
/** « Refusé » : date du refus, motif facultatif (145). */
export const ID_REFUSE = 4
/** « Prévalidé » (150) : le 1er accord, en attente de confirmation. */
export const ID_PREVALIDE = 5

/** Prévalidé, confirmé ou réalisé : le 1er accord est acquis. */
export function estPrevalideOuPlus(id: number): boolean {
  return id === ID_PREVALIDE || id === ID_VALIDE || id === ID_REALISE
}

/** Confirmé ou réalisé : le 2e accord est acquis. */
export function estConfirmeOuPlus(id: number): boolean {
  return id === ID_VALIDE || id === ID_REALISE
}

const LABELS_DEFAUT: Record<number, string> = {
  [ID_DEMANDE]: 'Proposition',
  [ID_PREVALIDE]: 'Prévalidé',
  [ID_VALIDE]: 'Confirmé',
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
  // Couleurs des statuts (demande PO du 12/11/2026), simples à reconnaître :
  // gris = projet, bleu = validé, vert = réalisé (vraiment fini), rouge =
  // refusé (ou abandonné). Le violet « devis reçus » et l'orange « reporté »
  // ne sont pas des statuts : voir `stadeProjet` et `reporteDe`.
  // Jaune = prévalidé, en attente du 2e accord (150).
  [ID_DEMANDE]: 'neutral',
  [ID_PREVALIDE]: 'yellow',
  [ID_VALIDE]: 'info',
  [ID_REALISE]: 'success',
  [ID_REFUSE]: 'destructive',
}
export function statutCapexTone(id: number): StatusTone {
  return statusToneById(id, TONES)
}

/**
 * STADE d'un projet, pour sa couleur (demande PO du 12/11/2026) : un projet
 * qui a déjà des devis n'en est plus au même point qu'un projet vide, même si
 * aucun n'est encore choisi.
 */
export type StadeCapex =
  | 'projet'
  | 'devis'
  | 'prevalide'
  | 'valide'
  | 'realise'
  | 'refuse'

export function stadeProjet(
  p: Pick<Investissement, 'statut_capex_id'> & { devis: readonly unknown[] },
): StadeCapex {
  if (p.statut_capex_id === ID_PREVALIDE) return 'prevalide'
  if (p.statut_capex_id === ID_VALIDE) return 'valide'
  if (p.statut_capex_id === ID_REALISE) return 'realise'
  if (p.statut_capex_id === ID_REFUSE) return 'refuse'
  return p.devis.length > 0 ? 'devis' : 'projet'
}

const TONS_STADE: Record<StadeCapex, StatusTone> = {
  projet: 'neutral', // gris : rien que l'idée
  devis: 'violet', // devis reçus, choisis ou non
  prevalide: 'yellow', // jaune : 1er accord, attend la confirmation
  valide: 'info', // bleu : confirmé, pas encore fait
  realise: 'success', // vert : fini
  refuse: 'destructive', // rouge : refusé ou abandonné
}

/** Couleur d'un projet : celle de son stade. */
export function toneProjet(
  p: Pick<Investissement, 'statut_capex_id'> & { devis: readonly unknown[] },
): StatusTone {
  return TONS_STADE[stadeProjet(p)]
}

/** Libellé de la pastille d'un projet : son statut, ou « Devis reçus ». */
export function libelleProjet(
  p: Pick<Investissement, 'statut_capex_id'> & { devis: readonly unknown[] },
  noms: Map<number, string>,
): string {
  return stadeProjet(p) === 'devis'
    ? 'Devis reçus'
    : nomStatutCapex(p.statut_capex_id, noms)
}

/**
 * Année d'où vient un projet REPORTÉ (demande PO du 12/11/2026) : la dernière
 * année de budget antérieure trouvée dans son historique ; null s'il n'a
 * jamais été reporté.
 */
export function reporteDe(p: {
  annee_budget: number
  decisions?: readonly { annee_budget: number | null }[]
}): number | null {
  let depuis: number | null = null
  for (const d of p.decisions ?? []) {
    const a = d.annee_budget
    if (a !== null && a < p.annee_budget && (depuis === null || a > depuis))
      depuis = a
  }
  return depuis
}

// Ordre LOGIQUE d'affichage (menu de filtre), indépendant des ids.
const ORDRE_AFFICHAGE: number[] = [
  ID_DEMANDE,
  ID_PREVALIDE,
  ID_VALIDE,
  ID_REALISE,
  ID_REFUSE,
]

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
  /** Somme des projets confirmés ou réalisés. */
  valide: number
}

/** Totaux d'une année de budget (décision PO : pas d'enveloppe, les totaux seuls). */
export function totauxAnnee(invs: readonly ProjetMontant[]): TotauxAnnee {
  let demande = 0
  let valide = 0
  for (const i of invs) {
    const m = montantProjet(i) ?? 0
    if (i.statut_capex_id !== ID_REFUSE) demande += m
    if (estConfirmeOuPlus(i.statut_capex_id)) valide += m
  }
  return {
    nb: invs.length,
    demande: centimes(demande),
    valide: centimes(valide),
  }
}

/** Ce que fait un clic sur une case du schéma. */
export type CleActionCapex =
  | 'prevalider'
  | 'deprevalider'
  | 'valider'
  | 'devalider'
  | 'refuser'
  | 'refuser2'
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
  prevalide: CaseCapex
  valide: CaseCapex
  realise: CaseCapex
  refuse: CaseCapex
  reporte: CaseCapex
  /** Refus au niveau de la CONFIRMATION : le 2e accord a échoué (150). */
  refuse2: CaseCapex
  /** Report au niveau de la confirmation : l'an prochain, toujours prévalidé. */
  reporte2: CaseCapex
  fleches: {
    /** De la décision vers « Prévalidé » (la fourche). */
    versPrevalide: EtatFlecheCapex
    /** De « Prévalidé » vers « Confirmé ». */
    versValide: EtatFlecheCapex
    versRefuse: EtatFlecheCapex
    versReporte: EtatFlecheCapex
    versRealise: EtatFlecheCapex
    /** De « Prévalidé » vers le refus / le report du 2e niveau. */
    versRefuse2: EtatFlecheCapex
    versReporte2: EtatFlecheCapex
  }
}

/**
 * SCHÉMA DE LA FICHE (138, 150, demandes PO) — façon organigramme Mermaid :
 *
 *                     Proposition
 *            ┌───────────┼───────────┐
 *         Refusé     Prévalidé    Reporter à N+1
 *            ┌───────────┼───────────┐
 *         Refusé      Confirmé    Reporter à N+1
 *                        │
 *                     Réalisé
 *
 * Deux niveaux d'accord (150, demandes PO du 12/11/2026), et à CHACUN on
 * peut refuser ou reporter : le 2e accord peut échouer. Refuser à la
 * confirmation garde la trace de la prévalidation ; y reporter envoie le
 * projet l'an prochain, toujours prévalidé. On ne CONFIRME qu'un projet
 * prévalidé, on ne RÉALISE qu'un projet confirmé. Chaque accord est un
 * interrupteur : recliquer sa case le retire.
 *
 * `refusApresPrevalidation` : le projet refusé l'a été au 2e niveau (il
 * garde sa date de prévalidation).
 */
export function schemaCapex(
  statutId: number,
  annee: number,
  noms: Map<number, string>,
  refusApresPrevalidation = false,
): SchemaCapex {
  const refus = statutId === ID_REFUSE
  const refus1 = refus && !refusApresPrevalidation
  const refus2 = refus && refusApresPrevalidation
  const prevalideOuPlus = estPrevalideOuPlus(statutId)
  const confirmeOuPlus = estConfirmeOuPlus(statutId)
  /** Le 1er accord est acquis (ou l'était quand le 2e a échoué). */
  const niveau2 = prevalideOuPlus || refus2
  const etat = (id: number, fait: boolean): EtatCaseCapex =>
    id === statutId ? 'actuel' : fait ? 'fait' : 'libre'
  const connu = [
    ID_DEMANDE,
    ID_PREVALIDE,
    ID_VALIDE,
    ID_REALISE,
    ID_REFUSE,
  ].includes(statutId)
  const prevalide: ActionCapex =
    statutId === ID_PREVALIDE
      ? // 2e clic : retire la prévalidation, retour en proposition.
        { cle: 'deprevalider', statutId: ID_DEMANDE, annee }
      : statutId === ID_VALIDE
        ? // Revenir à « Prévalidé » = retirer la confirmation.
          { cle: 'devalider', statutId: ID_PREVALIDE, annee }
        : {
            // Réalisé, ou refusé à la confirmation : on y revient, la date
            // de prévalidation est gardée.
            cle: statutId === ID_REALISE || refus2 ? 'rouvrir' : 'prevalider',
            statutId: ID_PREVALIDE,
            annee,
          }
  // « Confirmé » ne s'atteint QUE depuis « Prévalidé » (passage obligatoire).
  const valide: ActionCapex | null =
    statutId === ID_VALIDE
      ? { cle: 'devalider', statutId: ID_PREVALIDE, annee }
      : statutId === ID_REALISE
        ? { cle: 'rouvrir', statutId: ID_VALIDE, annee }
        : statutId === ID_PREVALIDE
          ? { cle: 'valider', statutId: ID_VALIDE, annee }
          : null
  const caseRefus = (
    actuel: boolean,
    action: ActionCapex | null,
  ): CaseCapex => ({
    libelle: nomStatutCapex(ID_REFUSE, noms),
    statutId: ID_REFUSE,
    etat: actuel ? 'actuel' : 'libre',
    action,
  })
  const caseReport = (action: ActionCapex | null): CaseCapex => ({
    libelle: `Reporter à ${String(annee + 1)}`,
    statutId: null,
    etat: 'libre',
    action,
  })
  return {
    demande: {
      libelle: nomStatutCapex(ID_DEMANDE, noms),
      statutId: ID_DEMANDE,
      etat: etat(ID_DEMANDE, connu),
      action:
        statutId === ID_DEMANDE
          ? null
          : { cle: 'relancer', statutId: ID_DEMANDE, annee },
    },
    prevalide: {
      libelle: nomStatutCapex(ID_PREVALIDE, noms),
      statutId: ID_PREVALIDE,
      etat: etat(ID_PREVALIDE, confirmeOuPlus || refus2),
      action: prevalide,
    },
    valide: {
      libelle: nomStatutCapex(ID_VALIDE, noms),
      statutId: ID_VALIDE,
      etat: etat(ID_VALIDE, statutId === ID_REALISE),
      action: valide,
    },
    // Réalisé / Refusé : même la case du projet reste cliquable — elle
    // rouvre sa fenêtre pour CORRIGER (date, bilan / motif). Réalisé ne
    // s'atteint qu'une fois le projet confirmé.
    realise: {
      libelle: nomStatutCapex(ID_REALISE, noms),
      statutId: ID_REALISE,
      etat: etat(ID_REALISE, false),
      action: confirmeOuPlus
        ? { cle: 'realiser', statutId: ID_REALISE, annee }
        : null,
    },
    // 1er niveau : refus / report de la proposition.
    refuse: caseRefus(refus1, { cle: 'refuser', statutId: ID_REFUSE, annee }),
    reporte: caseReport({
      cle: 'reporter',
      statutId: ID_DEMANDE,
      annee: annee + 1,
    }),
    // 2e niveau : seulement une fois le 1er accord acquis.
    refuse2: caseRefus(
      refus2,
      niveau2 ? { cle: 'refuser2', statutId: ID_REFUSE, annee } : null,
    ),
    reporte2: caseReport(
      niveau2
        ? { cle: 'reporter', statutId: ID_PREVALIDE, annee: annee + 1 }
        : null,
    ),
    fleches: {
      versPrevalide: niveau2 ? 'ok' : 'libre',
      versValide: confirmeOuPlus ? 'ok' : 'libre',
      versRefuse: refus1 ? 'refus' : 'libre',
      versReporte: 'libre',
      versRealise: statutId === ID_REALISE ? 'ok' : 'libre',
      versRefuse2: refus2 ? 'refus' : 'libre',
      versReporte2: 'libre',
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
  prevalide: string | null
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
    | 'date_prevalidation'
  >,
  decisions: readonly DecisionCapex[],
): DatesCapex {
  const journal = [...decisions].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )
  const statut = inv.statut_capex_id
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
    // Date saisie (150), sinon celle du journal.
    // Refusé à la confirmation : la prévalidation reste vraie.
    prevalide: estPrevalideOuPlus(statut)
      ? (inv.date_prevalidation ?? derniere(ID_PREVALIDE))
      : statut === ID_REFUSE
        ? inv.date_prevalidation
        : null,
    // Date saisie (146), sinon celle du journal (dossiers d'avant 146).
    valide: estConfirmeOuPlus(statut)
      ? (inv.date_validation ?? derniere(ID_VALIDE))
      : null,
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
 * 10/11/2026), dans l'ordre du parcours : Réalisé, Confirmé, Prévalidé, Proposition,
 * Refusé. Montant d'un projet = `montantProjet`. Les statuts sans projet
 * sont omis.
 */
export function repartitionBudget(
  invs: readonly ProjetMontant[],
): PartBudget[] {
  const ordre = [ID_REALISE, ID_VALIDE, ID_PREVALIDE, ID_DEMANDE, ID_REFUSE]
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
