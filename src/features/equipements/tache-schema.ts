import { z } from 'zod'
import { dateFacultative } from '@/lib/dates-zod'

/**
 * Tâche généralisée (090) : un libellé libre est son IDENTITÉ (seul champ
 * requis) ; le lieu (local + équipement), le commentaire sont des attributs
 * facultatifs. Partagé par Travaux (`travaux_taches`) et Événements
 * (`evenements_lieux`), qui restent deux tables distinctes en base — seule la
 * structure/le vocabulaire front sont unifiés (cf. plan
 * taches-checklist-travaux-evenements).
 */
export const tacheSchema = z.object({
  libelle: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  local_id: z.string(), // '' = aucun lieu
  equipement_id: z.string(), // '' = aucun équipement
  commentaire: z.string().trim().max(2000),
  date_tache: dateFacultative(), // '' = aucune date (093)
})

export type TacheFormValues = z.infer<typeof tacheSchema>

export function emptyTache(): TacheFormValues {
  return {
    libelle: '',
    local_id: '',
    equipement_id: '',
    commentaire: '',
    date_tache: '',
  }
}

/**
 * Nombre maximum de tâches saisies EN UNE FOIS depuis un formulaire (travaux ou
 * événement). Une soumission déclenche un INSERT par tâche : sans borne, une
 * valeur programmatique aberrante (10 000 lignes) part telle quelle vers la
 * base. 100 laisse très large devant l'usage réel (une poignée de tâches par
 * chantier) tout en fermant l'abus.
 */
export const MAX_TACHES = 100

/**
 * Tâches saisies EN LIGNE dans les formulaires Travaux et Événements : mêmes
 * règles de libellé que la brique ci-dessus (c'est la MÊME notion de tâche),
 * sans le commentaire ni la date — ces deux-là ne se saisissent que depuis la
 * fiche, via `TacheDialog`. `id` distingue une tâche existante d'une nouvelle.
 *
 * Dérivé de `tacheSchema` par `pick` plutôt que redéclaré : les deux
 * formulaires redéclaraient `libelle: z.string()` NU, donc acceptaient un
 * libellé blanc ou de 100 000 caractères là où la brique de référence exige un
 * libellé lisible d'au plus 200 caractères.
 */
export const tachesInlineSchema = z
  .array(
    tacheSchema
      .pick({ libelle: true, local_id: true, equipement_id: true })
      .extend({ id: z.string().optional() }),
  )
  .max(MAX_TACHES, `Trop de tâches : ${String(MAX_TACHES)} au maximum.`)
