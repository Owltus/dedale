import { z } from 'zod'

export const modeleDiSchema = z.object({
  libelle: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  constat_modele: z
    .string()
    .trim()
    .min(1, 'Le constat est obligatoire')
    .max(5000),
  /** Vignette du pool (`miniature_id`) ou `null`. */
  miniature_id: z.string().nullable(),
  /** Activation sans suppression. */
  etat: z.enum(['actif', 'inactif']),
  /** entreprise = catalogue commun (site_id NULL) ; site = modèle du site. */
  portee: z.enum(['entreprise', 'site']),
})

export type ModeleDiFormValues = z.infer<typeof modeleDiSchema>

export const emptyModeleDi: ModeleDiFormValues = {
  libelle: '',
  constat_modele: '',
  miniature_id: null,
  etat: 'actif',
  portee: 'entreprise',
}
