import { z } from 'zod'

export const gammeNatures = [
  'controle_reglementaire',
  'maintenance_preventive',
] as const

export const gammeSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  nature: z.enum(gammeNatures),
  periodicite_id: z.string().min(1, 'La périodicité est obligatoire'),
  prestataire_id: z.string().min(1, 'Le prestataire est obligatoire'),
  description: z.string().trim().max(2000),
})

export type GammeFormValues = z.input<typeof gammeSchema>

export const emptyGamme: GammeFormValues = {
  nom: '',
  nature: 'maintenance_preventive',
  periodicite_id: '',
  prestataire_id: '',
  description: '',
}

// Opérations : seuils saisis en texte (input number) → '' = non renseigné.
const optionalNumber = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Number(v)), {
    message: 'Valeur numérique invalide',
  })

export const operationSchema = z
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

export type OperationFormValues = z.input<typeof operationSchema>

export const emptyOperation: OperationFormValues = {
  nom: '',
  ordre: '',
  type_operation_id: '',
  unite_id: '',
  seuil_minimum: '',
  seuil_maximum: '',
  description: '',
}
