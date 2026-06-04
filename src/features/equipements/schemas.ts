import { z } from 'zod'

// Date optionnelle saisie en texte (input type=date) : '' → undefined.
const optionalDate = z
  .string()
  .trim()
  .max(10)
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'Date invalide',
  })

export const equipementSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  code_inventaire: z.string().trim().max(100),
  categorie_id: z.string(),
  local_id: z.string().min(1, 'L’emplacement est obligatoire'),
  date_mise_en_service: optionalDate,
  date_fin_garantie: optionalDate,
  commentaires: z.string().trim().max(2000),
})

export type EquipementFormValues = z.input<typeof equipementSchema>

export const emptyEquipement: EquipementFormValues = {
  nom: '',
  code_inventaire: '',
  categorie_id: '',
  local_id: '',
  date_mise_en_service: '',
  date_fin_garantie: '',
  commentaires: '',
}
