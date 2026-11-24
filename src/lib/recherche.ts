/**
 * Recherche texte de l'application : UNE règle partout — insensible à la casse
 * ET aux accents (« eclairage » trouve « Éclairage »), espaces de bord ignorés.
 *
 * - côté client : `correspondRecherche(recherche, ...valeurs)` ;
 * - côté serveur (PostgREST) : `motifRechercheServeur(recherche)` donne une
 *   expression régulière à passer à l'opérateur `imatch` (`~*`), qui applique
 *   la même règle sans extension `unaccent` (vérifié en base le 24/11/2026).
 */

/** Texte ramené à sa forme de comparaison : sans accents, en minuscules. */
export function normaliserRecherche(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Vrai si `recherche` (vide = tout passe) figure dans au moins une des
 * `valeurs` (les valeurs absentes sont ignorées).
 */
export function correspondRecherche(
  recherche: string,
  ...valeurs: readonly (string | null | undefined)[]
): boolean {
  const q = normaliserRecherche(recherche)
  if (q === '') return true
  return valeurs.some((v) => v != null && normaliserRecherche(v).includes(q))
}

/** Variantes accentuées (minuscules ET majuscules) de chaque lettre de base. */
const VARIANTES: Readonly<Record<string, string>> = {
  a: 'aàâäáãåAÀÂÄÁÃÅ',
  c: 'cçCÇ',
  e: 'eéèêëEÉÈÊË',
  i: 'iîïíìIÎÏÍÌ',
  n: 'nñNÑ',
  o: 'oôöóòõOÔÖÓÒÕ',
  u: 'uùûüúUÙÛÜÚ',
  y: 'yÿýYŸÝ',
}

/**
 * Motif pour l'opérateur PostgREST `imatch`, déjà entre guillemets (à placer
 * tel quel dans un `.or(...)`), ou `null` si la recherche est vide. Les
 * caractères spéciaux des expressions régulières et de PostgREST sont retirés :
 * la saisie reste un simple texte cherché « contient ».
 */
export function motifRechercheServeur(recherche: string): string | null {
  const q = normaliserRecherche(recherche).replace(
    /[\\^$.*+?()[\]{}|"',:]/g,
    '',
  )
  if (q === '') return null
  const regex = Array.from(q)
    .map((ch) => {
      const v = VARIANTES[ch]
      return v ? `[${v}]` : ch
    })
    .join('')
  return `"${regex}"`
}
