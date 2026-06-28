import { statutAffichageOt } from './statut-affichage'

/** Champs d'un OT nécessaires au tri par urgence (sous-ensemble de la carte). */
export interface OtTriable {
  statut: string
  origine?: string | null
  date_prevue: string | null
  date_cloture?: string | null
  tolerance_jours: number
}

// Rang du groupe d'urgence (du plus haut au plus bas dans la liste) :
//   0 Réouverts · 1 En retard · 2 En cours · 3 À venir · 4 Terminés
function rangUrgence(ot: OtTriable): number {
  switch (ot.statut) {
    case 'reouvert':
      return 0
    case 'en_cours':
      return 2
    case 'cloture':
    case 'annule':
      return 4
    default: {
      // « planifié » : son groupe se DÉDUIT de la date prévue, exactement comme le
      // badge (même fonction). La seule tonalité « destructive » d'un OT planifié
      // est « En retard » (« annulé », l'autre destructive, est déjà capté au-dessus)
      // → rang 1, sinon « À venir » → rang 3.
      const { tone } = statutAffichageOt({
        statut: ot.statut,
        origine: ot.origine,
        datePrevue: ot.date_prevue,
        toleranceJours: ot.tolerance_jours,
      })
      return tone === 'destructive' ? 1 : 3
    }
  }
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
 * → en cours → à venir → terminés), puis par DATE dans chaque groupe — les OT à
 * faire par date prévue CROISSANTE (le prochain à traiter en haut), les terminés
 * par date de clôture DÉCROISSANTE (l'historique le plus frais en haut). Pur, ne
 * mute pas l'entrée ; `rangUrgence` est calculé une seule fois par OT.
 */
export function trierOtParUrgence<T extends OtTriable>(ots: readonly T[]): T[] {
  return ots
    .map((ot) => ({ ot, rang: rangUrgence(ot) }))
    .sort((a, b) => {
      if (a.rang !== b.rang) return a.rang - b.rang
      // Terminés (rang 4) : clôture la plus récente d'abord ; sinon prévue la plus proche.
      return a.rang === 4
        ? compareDate(a.ot.date_cloture ?? null, b.ot.date_cloture ?? null, false)
        : compareDate(a.ot.date_prevue, b.ot.date_prevue, true)
    })
    .map((d) => d.ot)
}
