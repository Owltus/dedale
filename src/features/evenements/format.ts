/**
 * Local tel qu'il remonte de la requête, avec sa hiérarchie.
 * `niveaux`/`batiments` sont optionnels : la jointure peut être absente si le
 * select ne les demande pas.
 */
export interface LocalAvecChemin {
  nom: string
  niveaux?: { nom: string; batiments?: { nom: string } | null } | null
}

/**
 * Chemin lisible d'un local : « Bâtiment › Niveau › Local ».
 *
 * Les segments absents sont omis plutôt que remplacés par un tiret — un chemin
 * troué se lit moins bien qu'un chemin court. Le nom seul (« Stationnement ») ne
 * situe rien dans un établissement à plusieurs bâtiments, d'où l'ordre du plus
 * large au plus précis : on lit comme on se déplace.
 *
 * Même ordre que le sélecteur de lieu (`LocalSearchSelect`), pour qu'un lieu se
 * relise à l'identique là où on l'a choisi.
 */
export function cheminLocal(local: LocalAvecChemin | null | undefined): string {
  if (!local) return ''
  return [local.niveaux?.batiments?.nom, local.niveaux?.nom, local.nom]
    .filter((s) => Boolean(s))
    .join(' › ')
}
