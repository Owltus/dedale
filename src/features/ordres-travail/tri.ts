import { niveauUrgenceOt, NIVEAU_URGENCE } from './statut-affichage'

/** Champs d'un OT nécessaires au tri par urgence (sous-ensemble de la carte). */
export interface OtTriable {
  statut: string
  origine?: string | null
  date_prevue: string | null
  date_cloture?: string | null
  tolerance_jours: number
}

// Compare deux dates ISO (`YYYY-MM-DD`, comparables lexicographiquement), `null`
// TOUJOURS en dernier. `asc` = la plus proche d'abord ; sinon la plus récente d'abord.
function compareDate(a: string | null, b: string | null, asc: boolean): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const cmp = a < b ? -1 : 1
  return asc ? cmp : -cmp
}

/**
 * Tri par défaut de la liste des OT : par niveau d'URGENCE (réouverts → en retard
 * → en cours → à venir → terminés, cf. `niveauUrgenceOt`), puis par DATE dans chaque
 * groupe — les OT à faire par date prévue CROISSANTE (le prochain à traiter en haut),
 * les terminés par date de clôture DÉCROISSANTE (l'historique le plus frais en haut).
 * Pur, ne mute pas l'entrée ; le niveau est calculé une seule fois par OT.
 */
export function trierOtParUrgence<T extends OtTriable>(ots: readonly T[]): T[] {
  return ots
    .map((ot) => ({ ot, niveau: niveauUrgenceOt(ot) }))
    .sort((a, b) => {
      if (a.niveau !== b.niveau) return a.niveau - b.niveau
      // Terminés : clôture la plus récente d'abord ; sinon prévue la plus proche.
      return a.niveau === NIVEAU_URGENCE.termine
        ? compareDate(a.ot.date_cloture ?? null, b.ot.date_cloture ?? null, false)
        : compareDate(a.ot.date_prevue, b.ot.date_prevue, true)
    })
    .map((d) => d.ot)
}
