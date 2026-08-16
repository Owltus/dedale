import { STATUT_TERMINE } from './schemas'

/**
 * Date à AFFICHER en regard du statut, pour que les deux se répondent.
 *
 * Même règle que sur les événements et les investissements : la liste montrait
 * « Créé le … » quel que soit le statut, et ajoutait une seconde ligne
 * « Terminé le … » sur les travaux clos. Deux dates empilées de longueur
 * variable élargissaient le bloc de droite d'une ligne à l'autre — c'est ce qui
 * décalait les badges entre eux.
 *
 * Une seule date, donc, et celle qui correspond au badge affiché juste
 * au-dessus. La date de création reste lisible dans le sous-titre (quand le
 * travaux n'a pas de description) et sur la fiche.
 *
 * **Seul « Terminé » a une date de fin** : `date_fin` est posée par le trigger
 * `set_travaux_cloture_by` au passage au statut 4, et effacée à la réouverture.
 * « Annulé » est terminal lui aussi, mais n'en reçoit pas — un travaux annulé
 * affiche donc sa date de création, ce qui est la seule date qu'il possède.
 */
export function dateAffichee(t: {
  statut_travaux_id: number
  date_demande: string
  date_fin: string | null
}): string {
  if (t.statut_travaux_id === STATUT_TERMINE && t.date_fin !== null) {
    return t.date_fin
  }
  return t.date_demande
}
