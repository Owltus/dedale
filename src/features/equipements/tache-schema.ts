import { z } from 'zod'

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
})

export type TacheFormValues = z.infer<typeof tacheSchema>

export function emptyTache(): TacheFormValues {
  return { libelle: '', local_id: '', equipement_id: '', commentaire: '' }
}
