/**
 * Demande Dédale → texte du ticket Dmbook (décisions PO du 20/11/2026) :
 *   D8 — chambre(s) : « #112 constat » (« #301 #307 constat ») ; autre lieu ou aucun : le constat seul ;
 *   D9 — chambre changée dans Dédale : on corrige la tête « #112 » du texte Dmbook ;
 *        si le texte n'a pas de tête, on n'y touche pas et on ajoute la bonne chambre en tête.
 * Garantie testée : `chambresEnTete(composer…)` redonne exactement les chambres voulues.
 */

const tete = (chambres: string[]) => chambres.map((c) => `#${c}`).join(' ')

/** Texte complet d'un nouveau ticket, ou d'un ticket dont le constat a été modifié dans Dédale. */
export function composer(constat: string, chambres: string[]): string {
  const c = constat.trim()
  return chambres.length ? `${tete(chambres)} ${c}` : c
}

// Tête de chambres telle qu'écrite par les gens : « #112 », « 112 - », « # 112 / 113 », « #403 #404 ».
// Une mesure (« 110 degrés », « 105 € ») n'est jamais une tête de chambre.
const TETE_ECRITE = /^\s*(?:#?\s?[1-6](?:0[1-9]|[12]\d|3[01])(?![\d:h]|\s?(?:°|%|€|degr|cm|mm|kg|min|euros?\b))\s*(?:[-,/+]|et\b)?\s*)+/i

/**
 * Seules les chambres ont changé : on garde le texte Dmbook tel quel (signature,
 * retours à la ligne…) et on ne remplace que sa tête.
 */
export function changerChambres(texteActuel: string, chambres: string[]): string {
  const texte = texteActuel.replace(/^\s+/, '')
  const m = texte.match(TETE_ECRITE)
  if (m) {
    const reste = texte.slice(m[0].length)
    return chambres.length ? `${tete(chambres)} ${reste}` : reste.replace(/^[\s\-–:,.;/+]+/, '')
  }
  return chambres.length ? `${tete(chambres)} ${texte}` : texte
}
