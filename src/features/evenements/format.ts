import { STATUT_CLOTURE } from './schemas'

/**
 * Date à AFFICHER en regard du statut, pour que les deux se répondent.
 *
 * La liste montrait la date de survenue quel que soit le statut : un événement
 * « Clôturé » s'affichait avec la date à laquelle il était arrivé, ce qui se
 * lisait « clôturé le [jour où c'est arrivé] ». Le badge et la date disaient
 * deux choses différentes.
 *
 * **« En cours » retombe sur la date de survenue**, faute de mieux : la base ne
 * porte aucune date de prise en charge (seulement `date_evenement` et
 * `date_cloture`). `updated_at` serait trompeur — il bouge à la moindre
 * correction de faute de frappe. Y remédier demande une colonne dédiée, donc une
 * migration ; en attendant, mieux vaut la date vraie de l'événement qu'une date
 * technique qui ressemblerait à une information.
 */
export function dateAffichee(ev: {
  statut_evenement_id: number
  date_evenement: string
  date_cloture: string | null
}): string {
  if (ev.statut_evenement_id === STATUT_CLOTURE && ev.date_cloture !== null) {
    return ev.date_cloture
  }
  return ev.date_evenement
}

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
