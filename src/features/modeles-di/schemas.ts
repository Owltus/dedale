import { z } from 'zod'

export const modeleDiSchema = z.object({
  libelle: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  description: z.string().trim().max(2000),
  constat_modele: z
    .string()
    .trim()
    .min(1, 'Le constat est obligatoire')
    .max(5000),
  /** Activation sans suppression. */
  etat: z.enum(['actif', 'inactif']),
})

export type ModeleDiFormValues = z.infer<typeof modeleDiSchema>

export const emptyModeleDi: ModeleDiFormValues = {
  libelle: '',
  description: '',
  constat_modele: '',
  etat: 'actif',
}
