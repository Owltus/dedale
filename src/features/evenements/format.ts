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
