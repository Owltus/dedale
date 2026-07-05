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
