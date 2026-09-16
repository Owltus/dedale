import { z } from 'zod'
import { texteObligatoire } from '@/lib/texte-zod'

export const modeleDiSchema = z.object({
  libelle: texteObligatoire('Le libellé est obligatoire', 'libelle').max(200),
  constat_modele: texteObligatoire('Le constat est obligatoire', 'constat').max(
    5000,
  ),
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
