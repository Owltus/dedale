import { z } from 'zod'

// Champ numérique optionnel saisi en texte : '' → undefined, sinon nombre >= 0.
const optionalNumber = (label: string) =>
  z.string().transform((raw, ctx): number | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const n = Number(trimmed)
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être un nombre` })
      return z.NEVER
    }
    if (n < 0) {
      ctx.addIssue({
        code: 'custom',
        message: `${label} ne peut pas être négatif`,
      })
      return z.NEVER
    }
    return n
  })

// Identifiant numérique optionnel (référentiel) saisi en texte.
const optionalIntId = z.string().transform((raw, ctx): number | undefined => {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  if (!Number.isInteger(n)) {
    ctx.addIssue({ code: 'custom', message: 'Type de local invalide' })
    return z.NEVER
  }
  return n
})

// --- Bâtiment ---
// Vignette du pool (`miniature_id`) ou `null` — via le composant réutilisable
// MiniatureField (upload/crop), comme catégories/équipements.
const miniature = z.string().nullable()

export const batimentSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  miniature_id: miniature,
})

export type BatimentFormValues = z.input<typeof batimentSchema>

export const emptyBatiment: BatimentFormValues = {
  nom: '',
  description: '',
  miniature_id: null,
}

// --- Niveau ---
export const niveauSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  ordre: optionalNumber('L’ordre'),
  miniature_id: miniature,
})

export type NiveauFormValues = z.input<typeof niveauSchema>

export const emptyNiveau: NiveauFormValues = {
  nom: '',
  description: '',
  ordre: '',
  miniature_id: null,
}

// --- Local ---
export const localSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  surface_m2: optionalNumber('La surface'),
  type_local_id: optionalIntId,
  miniature_id: miniature,
})

export type LocalFormValues = z.input<typeof localSchema>

export const emptyLocal: LocalFormValues = {
  nom: '',
  description: '',
  surface_m2: '',
  type_local_id: '',
  miniature_id: null,
}
