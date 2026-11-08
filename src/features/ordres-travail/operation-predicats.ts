import type { Database } from '@/lib/database.types'

export type OperationExecution =
  Database['public']['Tables']['operations_execution']['Row']

/**
 * Une opération CAPTE une valeur (type « Mesure ») : a une UNITÉ (compteur,
 * °C, %…), des seuils, ou une valeur déjà relevée. Couvre les relevés de compteur
 * (mesures SANS seuils) et les données historiques.
 */
export function estMesureExecution(op: OperationExecution): boolean {
  return (
    op.unite_symbole !== null ||
    op.unite_nom !== null ||
    op.seuil_minimum !== null ||
    op.seuil_maximum !== null ||
    op.valeur_mesuree !== null
  )
}

/**
 * Un COMPTEUR = une mesure (unité) SANS seuils → relevé d'index cumulatif (eau,
 * électricité, heures…). Aucun flag dédié n'est snapshotté dans operations_execution
 * → on l'infère de l'absence de seuils, comme le distingue le modal de création.
 */
export function estCompteur(op: OperationExecution): boolean {
  return (
    estMesureExecution(op) &&
    op.seuil_minimum === null &&
    op.seuil_maximum === null
  )
}

/**
 * Un COMPTEUR CUMULATIF = un compteur dont l'unité s'incrémente d'un OT à l'autre
 * (kWh, m³, h) — par opposition à une mesure ponctuelle sans seuils (kVA), remise à
 * zéro à chaque OT. SEULE famille additionnable. Le drapeau `unite_est_cumulatif`
 * est snapshotté à la génération (migration 068) ; NULL (relevés orphelins) → non
 * cumulatif. Réservé aux SOMMES de la carte d'en-tête d'un OT (la saisie utilise
 * encore `estCompteur`, inchangé — décision PO).
 */
export function estCompteurCumulatif(op: OperationExecution): boolean {
  return estCompteur(op) && op.unite_est_cumulatif === true
}

/** Placeholder = plage de seuils attendue (sans unité : elle est affichée en
 *  suffixe du champ). Vide pour un compteur (pas de seuils). */
export function placeholderRange(op: OperationExecution): string | undefined {
  if (op.seuil_minimum !== null && op.seuil_maximum !== null)
    return `${String(op.seuil_minimum)} – ${String(op.seuil_maximum)}`
  if (op.seuil_minimum !== null) return `≥ ${String(op.seuil_minimum)}`
  if (op.seuil_maximum !== null) return `≤ ${String(op.seuil_maximum)}`
  return undefined
}

/**
 * Conformité calculée EN DIRECT (aperçu) depuis la valeur saisie et les seuils :
 * dans la plage → conforme, hors plage → non conforme, sinon (pas de seuils / pas
 * de valeur / valeur invalide) → indéterminé. Le backend recalcule `est_conforme`
 * à l'enregistrement (auto_calcul_conformite) ; ici c'est le retour visuel immédiat.
 */
export function conformiteLocale(
  valeur: string,
  op: OperationExecution,
): boolean | null {
  if (op.seuil_minimum === null && op.seuil_maximum === null) return null
  const s = valeur.trim()
  if (s === '') return null
  const v = Number(s)
  if (Number.isNaN(v)) return null
  if (op.seuil_minimum !== null && v < op.seuil_minimum) return false
  if (op.seuil_maximum !== null && v > op.seuil_maximum) return false
  return true
}

/** Valeurs éditables d'une opération d'exécution (état CONTRÔLÉ par le parent). */
export interface OperationEdit {
  statut: string
  valeur: string
  dateExec: string
  // Remplacement de compteur (manuel) — chaînes vides hors remplacement.
  indexDepose: string
  indexPose: string
  dateRemplacement: string
}

/** Une opération est-elle dans un état TERMINAL (ni à faire, ni en cours) ? */
export function statutOpTerminal(statut: string): boolean {
  return statut !== 'en_attente' && statut !== 'en_cours'
}

/**
 * Bascule d'une ligne au double-clic / à l'appui long : une non-mesure passe
 * Terminée ↔ En attente (une « non applicable » passe Terminée) ; une mesure est
 * RÉINITIALISÉE avec un éventuel remplacement de compteur — on ne « termine » pas
 * une mesure sans valeur.
 */
export function basculerStatut(
  edit: OperationEdit,
  mesure: boolean,
): OperationEdit {
  if (mesure) {
    return {
      ...edit,
      valeur: '',
      statut: 'en_attente',
      indexDepose: '',
      indexPose: '',
      dateRemplacement: '',
    }
  }
  return {
    ...edit,
    statut: edit.statut === 'terminee' ? 'en_attente' : 'terminee',
  }
}

/** Clé du groupe des lignes SANS équipement dans un OT mixte (jamais un UUID). */
export const CLE_GROUPE_GENERAL = 'general'

/** Lignes d'un OT rangées sous un même équipement (ou le groupe « Général »). */
export interface GroupeEquipement {
  /** `equipement_id` — jamais le libellé, qui peut se répéter. */
  cle: string
  /** Libellé court de l'en-tête : dernier segment du chemin de localisation. */
  titre: string
  /** Chemin complet + nom de l'équipement (infobulle), `null` pour « Général ». */
  detail: string | null
  /** Lignes du groupe, dans l'ordre de la requête. */
  ops: OperationExecution[]
}

/** Texte significatif, ou `null` s'il est absent ou blanc. */
function texteOuNull(s: string | null | undefined): string | null {
  const t = s?.trim() ?? ''
  return t === '' ? null : t
}

/** Dernier segment d'un chemin « R+3 / Chambre 302 » → « Chambre 302 ». */
function dernierSegment(chemin: string): string {
  return texteOuNull(chemin.split(' / ').at(-1)) ?? chemin
}

/**
 * Range les lignes d'un OT par équipement. `null` quand AUCUNE ligne ne porte
 * d'équipement : l'écran reste alors à plat, strictement comme avant. Sinon, un
 * groupe par `equipement_id`, trié par titre en ordre numérique (« Chambre 302 »
 * avant « Chambre 1010 ») ; les lignes sans équipement d'un OT mixte forment le
 * groupe « Général », en tête. L'ordre de la requête est conservé dans un groupe.
 */
export function grouperParEquipement(
  ops: OperationExecution[],
): GroupeEquipement[] | null {
  if (!ops.some((op) => op.equipement_id !== null)) return null
  const general: OperationExecution[] = []
  const parEquipement = new Map<string, GroupeEquipement>()
  for (const op of ops) {
    if (op.equipement_id === null) {
      general.push(op)
      continue
    }
    let groupe = parEquipement.get(op.equipement_id)
    if (!groupe) {
      const chemin = texteOuNull(op.nom_localisation)
      const nom = texteOuNull(op.nom_equipement)
      groupe = {
        cle: op.equipement_id,
        titre: chemin ? dernierSegment(chemin) : (nom ?? 'Équipement'),
        detail: texteOuNull(
          [chemin, nom].filter((t) => t !== null).join(' — '),
        ),
        ops: [],
      }
      parEquipement.set(op.equipement_id, groupe)
    }
    groupe.ops.push(op)
  }
  const groupes = [...parEquipement.values()].sort(
    (a, b) =>
      a.titre.localeCompare(b.titre, 'fr', { numeric: true }) ||
      a.cle.localeCompare(b.cle),
  )
  return general.length > 0
    ? [
        {
          cle: CLE_GROUPE_GENERAL,
          titre: 'Général',
          detail: null,
          ops: general,
        },
        ...groupes,
      ]
    : groupes
}
