import { z } from 'zod'
import { texteObligatoire } from '@/lib/texte-zod'

/**
 * Identifiants de lignes : colonnes UUID côté base, listes déroulantes côté
 * écran. Toute autre chaîne part en 22P02 (`invalid_text_representation`). Le
 * champ reste une `string` (ce que produit un `<select>`) : seule sa FORME est
 * contrainte, et le vide dit toujours « obligatoire », pas « mal formé ».
 */
const REFERENCE_INVALIDE =
  'Référence invalide : rechargez la page puis réessayez.'

export const modeleOperationSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  /** Catégorie de rattachement, OBLIGATOIRE : tout modèle est rangé sous une catégorie. */
  categorie_id: z
    .string()
    .min(1, 'La catégorie est obligatoire')
    .pipe(z.uuid(REFERENCE_INVALIDE)),
  /** Vignette du pool (`miniature_id`) ou `null`. */
  miniature_id: z.uuid('Vignette invalide : rechargez la page.').nullable(),
  /** entreprise = catalogue global (site_id NULL) ; site = catalogue du site actif. */
  portee: z.enum(['entreprise', 'site']),
})

export type ModeleOperationFormValues = z.input<typeof modeleOperationSchema>

export const emptyModeleOperation: ModeleOperationFormValues = {
  nom: '',
  description: '',
  categorie_id: '',
  miniature_id: null,
  portee: 'entreprise',
}

/**
 * Notation numérique usuelle. L'exponentielle est admise — `String()` la
 * produit seul pour les très petites valeurs — mais ni l'hexadécimal, ni le
 * binaire, ni l'octal, ni l'infini.
 */
const NOMBRE_USUEL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * Seuils saisis en texte (input number) → '' = non renseigné.
 *
 * Copie ASSUMÉE de l'homonyme de `gammes/schemas.ts` (décision D4) : les deux
 * écrans saisissent la même opération, et `schemas.test.ts` vérifie qu'ils
 * rendent le même verdict. En revanche ni l'un ni l'autre ne peut être
 * mutualisé avec `localisations/schemas.ts` : un seuil de mesure est
 * légitimement NÉGATIF (chambre froide), une surface jamais.
 */
const optionalNumber = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || (NOMBRE_USUEL.test(v) && Number.isFinite(Number(v))),
    { message: 'Saisissez un nombre fini (ni infini, ni texte).' },
  )

/** `modeles_operations_items.ordre INTEGER` : 2 147 483 647 au plus. */
const ORDRE_MAX = 2_147_483_647
const ordreItem = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= ORDRE_MAX), {
    message: 'Le rang doit être un entier compris entre 0 et 2 147 483 647.',
  })

export const operationItemSchema = z
  .object({
    nom: texteObligatoire('Le libellé est obligatoire', 'libelle').max(200),
    ordre: ordreItem,
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
