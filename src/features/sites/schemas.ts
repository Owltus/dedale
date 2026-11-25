import { z } from 'zod'
import { texteObligatoire } from '@/lib/texte-zod'

export const siteSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire').max(200),
  adresse: z.string().trim().max(500),
  // Aucune contrainte côté base (colonne TEXT libre) : politique d'interface.
  // 5 chiffres en France, formats étrangers admis (lettres, espaces, tirets)
  // dans 20 caractères ; tout autre signe rend l'adresse inexploitable.
  code_postal: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9A-Za-z -]*$/, {
      error:
        'Code postal invalide : chiffres, lettres, espaces et tirets seulement.',
    }),
  ville: z.string().trim().max(200),
})

export type SiteFormValues = z.infer<typeof siteSchema>

export const emptySite: SiteFormValues = {
  nom: '',
  adresse: '',
  code_postal: '',
  ville: '',
}
