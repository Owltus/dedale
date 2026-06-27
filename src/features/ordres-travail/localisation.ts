/**
 * Localisation intelligente d'un OT : le plus grand lieu COMMUN des équipements
 * liés à sa gamme, dans la hiérarchie batiment -> niveau -> local.
 *
 * Règle (décision PO) : on descend le plus bas possible ; à défaut on remonte au
 * contenant commun (bâtiment, sinon site). On affiche TOUJOURS un lieu (jamais
 * vide). Le nom du bâtiment n'est ajouté en PRÉFIXE d'un lieu précis (niveau/local)
 * que s'il existe au moins deux bâtiments dans le périmètre (sinon implicite).
 */
export interface EquipementLieu {
  local_id: string | null
  niveau_id: string | null
  batiment_id: string | null
  local_nom: string | null
  niveau_nom: string | null
  batiment_nom: string | null
  site_nom: string | null
}

export function lieuCommun(
  eqs: EquipementLieu[],
  nbBatiments: number,
): string | null {
  // Un équipement sans bâtiment résolu (donnée incomplète) est ignoré.
  const valides = eqs.filter((e) => e.batiment_id !== null)
  const ref = valides[0]
  if (!ref) return null

  const memeLocal = valides.every((e) => e.local_id === ref.local_id)
  const memeNiveau = valides.every((e) => e.niveau_id === ref.niveau_id)
  const memeBatiment = valides.every((e) => e.batiment_id === ref.batiment_id)

  // Préfixe bâtiment seulement pour un lieu précis ET si >= 2 bâtiments existent.
  const prefixe =
    nbBatiments > 1 && memeBatiment && ref.batiment_nom
      ? `${ref.batiment_nom} / `
      : ''

  if (memeLocal)
    return `${prefixe}${ref.niveau_nom ?? ''} / ${ref.local_nom ?? ''}`
  if (memeNiveau) return `${prefixe}${ref.niveau_nom ?? ''}`
  if (memeBatiment) return ref.batiment_nom // étages différents -> le bâtiment commun
  return ref.site_nom // plusieurs bâtiments -> le site commun
}
