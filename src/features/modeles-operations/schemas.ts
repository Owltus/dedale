import { z } from 'zod'

export const modeleOperationSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  /** entreprise = catalogue global (site_id NULL) ; site = catalogue du site actif. */
  portee: z.enum(['entreprise', 'site']),
})

export type ModeleOperationFormValues = z.input<typeof modeleOperationSchema>

export const emptyModeleOperation: ModeleOperationFormValues = {
  nom: '',
  description: '',
  portee: 'entreprise',
}

// Seuils saisis en texte (input number) → '' = non renseigné.
const optionalNumber = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Number(v)), {
    message: 'Valeur numérique invalide',
  })

export const operationItemSchema = z
  .object({
    nom: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
    ordre: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d+$/.test(v), {
        message: 'Entier positif attendu',
      }),
    type_operation_id: z.string().min(1, 'Le type est obligatoire'),
    unite_id: z.string(),
    seuil_minimum: optionalNumber,
    seuil_maximum: optionalNumber,
    description: z.string().trim().max(2000),
  })
  .refine(
    (v) =>
      v.seuil_minimum === '' ||
      v.seuil_maximum === '' ||
      Number(v.seuil_minimum) <= Number(v.seuil_maximum),
    {
      message: 'Le seuil min doit être ≤ au seuil max',
      path: ['seuil_maximum'],
    },
  )

export type OperationItemFormValues = z.input<typeof operationItemSchema>

export const emptyOperationItem: OperationItemFormValues = {
  nom: '',
  ordre: '',
  type_operation_id: '',
  unite_id: '',
  seuil_minimum: '',
  seuil_maximum: '',
  description: '',
}
