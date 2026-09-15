import type { StatusTone } from '@/components/common/status-badge'
import { statusLabelById } from '@/components/common/status-badge'
import { diTitre } from '@/features/demandes/schemas'
import {
  statutLabel as statutLabelDi,
  statutTone as statutToneDi,
  STATUTS_DI_TERMINAUX,
} from '@/features/demandes/etat'
import {
  statutTravauxTone,
  STATUTS_TRAVAUX_TERMINAUX,
} from '@/features/travaux/etat'
import {
  statutEvenementTone,
  STATUTS_EVENEMENTS_TERMINAUX,
} from '@/features/evenements/etat'
import { dateAffichee as dateAfficheeTravaux } from '@/features/travaux/format'
import { dateAffichee as dateAfficheeEvenement } from '@/features/evenements/format'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'

/**
 * Normalisation des trois journaux du site (demandes d'intervention, travaux,
 * événements) vers UNE forme de ligne commune, pour que la carte « Activité » du
 * tableau de bord les présente et les ouvre EXACTEMENT de la même façon d'un
 * onglet à l'autre. Chaque feature garde ses règles (code couleur, date à
 * afficher en regard du statut) : elles sont réutilisées ici, jamais réécrites.
 *
 * Fonctions PURES, testées (`activite.test.ts`) : le composant ne fait que
 * choisir l'onglet et naviguer.
 */

export interface LigneActivite {
  id: string
  titre: string
  /** Date déjà formatée, affichée sous le titre. */
  sousTitre: string
  /** Libellé du statut (pastille de droite). */
  statut: string
  tone: StatusTone
  /**
   * Statut TERMINAL (clôturé, terminé…) : sert au tri et au choix de l'onglet
   * ouvert par défaut, qui se porte là où il reste quelque chose à traiter.
   */
  termine: boolean
  /** Segment d'URL de la fiche — slug unique parmi les frères, jamais l'UUID. */
  slug: string
}

/** Ce qu'une source doit savoir dire d'une de ses lignes. */
interface SourceActivite<T> {
  id: (row: T) => string
  /** Titre affiché ET base du slug (les deux doivent coïncider). */
  nom: (row: T) => string
  /** Date à montrer en regard du statut affiché. */
  date: (row: T) => string
  statut: (row: T) => string
  tone: (row: T) => StatusTone
  /** Identifiant de statut, confronté aux statuts terminaux de la feature. */
  statutId: (row: T) => number
  terminaux: readonly number[]
}

/**
 * Ordonne et convertit une liste. Les lignes NON TERMINÉES passent en tête (ce
 * qui reste à traiter se lit en premier), l'ordre de récence fourni par la query
 * étant préservé à l'intérieur de chaque groupe par un filtrage stable.
 *
 * Les frères du slug sont calculés sur la liste COMPLÈTE, avant tri et avant
 * toute troncature : même ensemble qu'à la résolution dans la fiche détail
 * (symétrie `segOfUnique`), sinon un clic ouvrirait la mauvaise fiche.
 */
function construire<T>(rows: T[], src: SourceActivite<T>): LigneActivite[] {
  const sibs = rows.map((r) => ({ nom: src.nom(r), id: src.id(r) }))
  const estTermine = (r: T) => src.terminaux.includes(src.statutId(r))
  const ordonnees = [
    ...rows.filter((r) => !estTermine(r)),
    ...rows.filter((r) => estTermine(r)),
  ]
  return ordonnees.map((r) => ({
    id: src.id(r),
    titre: src.nom(r),
    sousTitre: formatDate(src.date(r)),
    statut: src.statut(r),
    tone: src.tone(r),
    termine: estTermine(r),
    slug: segOfUnique({ nom: src.nom(r), id: src.id(r) }, sibs),
  }))
}

/** Colonnes nécessaires d'une demande d'intervention (`demandes_intervention`). */
export interface RowDemande {
  id: string
  constat: string
  date_constat: string
  statut_di_id: number
}

/** Colonnes nécessaires d'un travaux (`interventions_travaux`). */
export interface RowTravaux {
  id: string
  titre: string
  date_demande: string
  date_fin: string | null
  statut_travaux_id: number
}

/** Colonnes nécessaires d'un événement (`evenements`). */
export interface RowEvenement {
  id: string
  titre: string
  date_evenement: string
  date_cloture: string | null
  statut_evenement_id: number
}

export function lignesDemandes(rows: RowDemande[]): LigneActivite[] {
  return construire(rows, {
    id: (d) => d.id,
    nom: (d) => diTitre(d.constat),
    date: (d) => d.date_constat,
    statut: (d) => statutLabelDi(d.statut_di_id),
    tone: (d) => statutToneDi(d.statut_di_id),
    statutId: (d) => d.statut_di_id,
    terminaux: STATUTS_DI_TERMINAUX,
  })
}

/**
 * `statuts` : référentiel `statuts_travaux` (id → nom). Travaux et événements
 * tirent leur libellé de la base, contrairement aux demandes dont les trois
 * statuts sont figés côté front.
 */
export function lignesTravaux(
  rows: RowTravaux[],
  statuts: Map<number, string>,
): LigneActivite[] {
  return construire(rows, {
    id: (t) => t.id,
    nom: (t) => t.titre,
    date: (t) => dateAfficheeTravaux(t),
    statut: (t) => statusLabelById(t.statut_travaux_id, statuts),
    tone: (t) => statutTravauxTone(t.statut_travaux_id),
    statutId: (t) => t.statut_travaux_id,
    terminaux: STATUTS_TRAVAUX_TERMINAUX,
  })
}

/** `statuts` : référentiel `statuts_evenements` (id → nom). */
export function lignesEvenements(
  rows: RowEvenement[],
  statuts: Map<number, string>,
): LigneActivite[] {
  return construire(rows, {
    id: (e) => e.id,
    nom: (e) => e.titre,
    date: (e) => dateAfficheeEvenement(e),
    statut: (e) => statusLabelById(e.statut_evenement_id, statuts),
    tone: (e) => statutEvenementTone(e.statut_evenement_id),
    statutId: (e) => e.statut_evenement_id,
    terminaux: STATUTS_EVENEMENTS_TERMINAUX,
  })
}
