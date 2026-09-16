import { z } from 'zod'
import { texteObligatoire } from '@/lib/texte-zod'

export const siteSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire').max(200),
  adresse: z.string().trim().max(500),
  code_postal: z.string().trim().max(20),
  ville: z.string().trim().max(200),
})

export type SiteFormValues = z.infer<typeof siteSchema>

export const emptySite: SiteFormValues = {
  nom: '',
  adresse: '',
  code_postal: '',
  ville: '',
}
