import { z } from 'zod'
import { champSchema } from '@/lib/champs'

export const modeleEquipementSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  /** Catégorie de rattachement, OBLIGATOIRE : tout modèle est rangé sous une catégorie. */
  categorie_id: z.string().min(1, 'La catégorie est obligatoire'),
  /** entreprise = catalogue global (site_id NULL) ; site = catalogue du site actif. */
  portee: z.enum(['entreprise', 'site']),
  /** Activation sans suppression. */
  etat: z.enum(['actif', 'inactif']),
  /** Vignette du pool (`miniature_id`) ou `null`. */
  miniature_id: z.string().nullable(),
  /** Champs typés (définitions) ; nettoyés/validés finement à la soumission. */
  specifications: z.array(champSchema),
})

export type ModeleEquipementFormValues = z.infer<typeof modeleEquipementSchema>

export const emptyModeleEquipement: ModeleEquipementFormValues = {
  nom: '',
  description: '',
  categorie_id: '',
  portee: 'entreprise',
  etat: 'actif',
  miniature_id: null,
  specifications: [],
}
