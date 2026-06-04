import { z } from 'zod'

export const siteSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
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
