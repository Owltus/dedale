// Aides des APERÇUS bornés (tableau de bord, fiche ouverte depuis un aperçu) :
// « non terminés d'abord, puis les plus récents », sur deux lectures limitées.

/**
 * Lignes chargées par journal du tableau de bord. La carte en affiche une
 * vingtaine au plus (calage à la hauteur) : charger l'historique entier (4 071
 * demandes) pour en montrer 15 n'avait aucun sens.
 */
export const LIGNES_ACTIVITE = 30

/**
 * Ce qu'il reste à traiter d'abord, puis le plus récent : MÊME ordre que
 * l'ancienne normalisation sur la liste complète (non terminés en tête, récence
 * à l'intérieur de chaque groupe), mais sur deux lectures bornées.
 */
export function ouvertsPuisRecents<T>(ouverts: T[], termines: T[]): T[] {
  return [...ouverts, ...termines].slice(0, LIGNES_ACTIVITE)
}

/** Liste PostgREST d'identifiants numériques : `(1,2,3)`. */
export const enListe = (ids: readonly number[]) => `(${ids.join(',')})`
