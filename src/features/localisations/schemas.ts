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

/**
 * Rang d'affichage d'un niveau. La base documente la convention : SS = -1,
 * RDC = 0, R+1 = 1 (`schema_complete.sql`). Le champ doit donc accepter les
 * négatifs — `optionalNumber` les refuse, ce qui a déjà conduit un utilisateur
 * à renuméroter tout son immeuble de +1.
 */
const ORDRE_MIN = -32_768
const ORDRE_MAX = 32_767
const ordreNiveau = z.string().transform((raw, ctx): number | undefined => {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  if (!Number.isInteger(n)) {
    ctx.addIssue({
      code: 'custom',
      message:
        'L’ordre doit être un entier : sous-sol −2 ou −1, rez-de-chaussée 0, étages 1, 2, 3…',
    })
    return z.NEVER
  }
  if (n < ORDRE_MIN || n > ORDRE_MAX) {
    ctx.addIssue({
      code: 'custom',
      message:
        'L’ordre doit rester un numéro d’étage plausible, entre −32 768 et 32 767',
    })
    return z.NEVER
  }
  return n
})

// Entier optionnel >= 0 saisi en texte (effectif admissible).
const optionalInt = (label: string) =>
  z.string().transform((raw, ctx): number | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({
        code: 'custom',
        message: `${label} doit être un entier positif`,
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
/** Valeurs VALIDÉES (post-parse) transmises aux mutations. */
export type BatimentValues = z.output<typeof batimentSchema>

export const emptyBatiment: BatimentFormValues = {
  nom: '',
  description: '',
  miniature_id: null,
}

// --- Niveau ---
export const niveauSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  ordre: ordreNiveau,
  miniature_id: miniature,
})

export type NiveauFormValues = z.input<typeof niveauSchema>
/** Valeurs VALIDÉES (post-parse) transmises aux mutations. */
export type NiveauValues = z.output<typeof niveauSchema>

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
  /** Local chauffé / climatisé (remontée de la surface chauffée). */
  chauffe_climatise: z.boolean(),
  /** Hauteur sous plafond (m) → volume roulé par niveau / bâtiment (111). */
  hauteur_m: optionalNumber('La hauteur'),
  /** Effectif admissible (base du calcul d'effectif ERP) (111). */
  capacite_personnes: optionalInt('L’effectif'),
  /** Accessible aux personnes à mobilité réduite (111). */
  accessible_pmr: z.boolean(),
})

export type LocalFormValues = z.input<typeof localSchema>
/** Valeurs VALIDÉES (post-parse) transmises aux mutations. */
export type LocalValues = z.output<typeof localSchema>

export const emptyLocal: LocalFormValues = {
  nom: '',
  description: '',
  surface_m2: '',
  type_local_id: '',
  miniature_id: null,
  chauffe_climatise: false,
  hauteur_m: '',
  capacite_personnes: '',
  accessible_pmr: false,
}
