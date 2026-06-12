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
  // Sous-catégorie de rattachement, OBLIGATOIRE (NOT NULL + trigger côté base) :
  // toute gamme — réelle de site comprise — pointe une sous-catégorie (niveau 2).
  categorie_id: z.string().min(1, 'La sous-catégorie est obligatoire'),
  description: z.string().trim().max(2000),
})

export type GammeFormValues = z.input<typeof gammeSchema>

export const emptyGamme: GammeFormValues = {
  nom: '',
  nature: 'maintenance_preventive',
  periodicite_id: '',
  prestataire_id: '',
  categorie_id: '',
  description: '',
}

/**
 * Gamme-template de la Bibliothèque : étend le schéma de gamme avec une
 * **catégorie obligatoire** (scope `gamme`/`mixte`, l'arborescence) et une
 * **portée** (commun = `site_id NULL` inviolable, ou un site). Le schéma de
 * gamme de SITE reste inchangé (catégorie absente du flux existant).
 */
export const gammeBiblioSchema = gammeSchema.extend({
  categorie_id: z.string().min(1, 'La catégorie est obligatoire'),
  portee: z.enum(['entreprise', 'site']),
  // Un template commun n'a PAS de prestataire (il dépend du site, renseigné
  // après copie) : le champ est facultatif ici (autorise '' → NULL en base),
  // contrairement à la gamme réelle (`gammeSchema`) qui l'exige.
  prestataire_id: z.string(),
  /** Vignette du pool (`miniature_id`) ou `null`. */
  miniature_id: z.string().nullable(),
})

export type GammeBiblioFormValues = z.input<typeof gammeBiblioSchema>

export const emptyGammeBiblio: GammeBiblioFormValues = {
  ...emptyGamme,
  categorie_id: '',
  portee: 'entreprise',
  miniature_id: null,
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
