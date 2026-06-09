import { z } from 'zod'

/** Une caractéristique technique du modèle (paire clé/valeur libre). */
export interface SpecLine {
  cle: string
  valeur: string
}

export const modeleEquipementSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  /** '' = aucune catégorie. */
  categorie_id: z.string(),
  /** entreprise = catalogue global (site_id NULL) ; site = catalogue du site actif. */
  portee: z.enum(['entreprise', 'site']),
  /** Activation sans suppression. */
  etat: z.enum(['actif', 'inactif']),
  /** Caractéristiques (clés/valeurs libres) ; validées finement à la soumission. */
  specifications: z.array(z.object({ cle: z.string(), valeur: z.string() })),
})

export type ModeleEquipementFormValues = z.infer<typeof modeleEquipementSchema>

export const emptyModeleEquipement: ModeleEquipementFormValues = {
  nom: '',
  description: '',
  categorie_id: '',
  portee: 'entreprise',
  etat: 'actif',
  specifications: [],
}
