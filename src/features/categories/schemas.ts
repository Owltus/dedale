import { z } from 'zod'

/** Types (scope) d'une catégorie : ce qu'elle qualifie. */
export const CATEGORIE_SCOPES = [
  { value: 'equipement', label: 'Équipement' },
  { value: 'operation', label: 'Opération' },
  { value: 'gamme', label: 'Gamme' },
  { value: 'mixte', label: 'Mixte' },
] as const

export const categorieSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  scope: z.enum(['equipement', 'gamme', 'mixte', 'operation']),
  description: z.string().trim().max(2000),
  /** '' = catégorie racine (sans parent). */
  parent_id: z.string(),
  /** entreprise = catalogue global (site_id NULL) ; site = catalogue du site actif. */
  portee: z.enum(['entreprise', 'site']),
  /** Activation sans suppression. */
  etat: z.enum(['actif', 'inactif']),
  /** Vignette du pool (`miniature_id`) ou `null`. */
  miniature_id: z.string().nullable(),
})

export type CategorieFormValues = z.infer<typeof categorieSchema>

export const emptyCategorie: CategorieFormValues = {
  nom: '',
  scope: 'equipement',
  description: '',
  parent_id: '',
  portee: 'entreprise',
  etat: 'actif',
  miniature_id: null,
}
