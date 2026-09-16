import { z } from 'zod'

/**
 * Notation décimale usuelle — celle qu'un clavier produit dans un champ de
 * saisie. Volontairement plus étroite que `Number()`, qui lit `'0x10'` comme
 * 16, `'1e7'` comme dix millions et `'Infinity'` comme l'infini : trois valeurs
 * qu'aucun usager ne voulait saisir, et que la base refuse ensuite en 22003.
 */
const DECIMAL_USUEL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const ENTIER_USUEL = /^[+-]?\d+$/

/**
 * Bornes d'un champ numérique, recopiées de la colonne visée.
 *
 * `message` est UNIQUE et DIT la borne : qu'on refuse la forme (`'0x10'`) ou la
 * valeur (`'1000000'`), l'usager lit la même phrase et sait quoi saisir — un
 * « doit être un nombre » sur `'1e7'` ne lui apprendrait rien.
 */
interface BorneNumerique {
  min: number
  max: number
  /** Borne basse STRICTE — miroir d'un `CHECK (… > 0)`. */
  minExclusif?: boolean
  message: string
}

/**
 * Champ décimal optionnel saisi en texte : '' → `undefined` (colonne NULL).
 *
 * NE PAS mutualiser avec les helpers homonymes de `gammes/schemas.ts` et
 * `modeles-operations/schemas.ts` (décision D4) : ceux-là valident des SEUILS
 * DE MESURE, légitimement négatifs (une chambre froide se contrôle entre −25 °C
 * et −18 °C), là où une surface de local doit être strictement positive.
 */
const optionalNumber = (borne: BorneNumerique) =>
  z.string().transform((raw, ctx): number | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const n = Number(trimmed)
    const horsBorne = borne.minExclusif ? n <= borne.min : n < borne.min
    if (!DECIMAL_USUEL.test(trimmed) || horsBorne || n > borne.max) {
      ctx.addIssue({ code: 'custom', message: borne.message })
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
  // `ENTIER_USUEL` avant `Number.isInteger` : `Number('0x10')` vaut 16, un
  // entier au sens de JS — un niveau saisi « 0x10 » se rangerait au 16ᵉ étage.
  if (!ENTIER_USUEL.test(trimmed) || !Number.isInteger(n)) {
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

/**
 * Entier optionnel saisi en texte, borné comme la colonne qu'il alimente.
 * Même exigence de forme que `optionalNumber` : `Number.isInteger` seul juge
 * `'0x10'` entier (16) et `'1e9'` entier (un milliard, hors SMALLINT).
 */
const optionalInt = (borne: { min: number; max: number; message: string }) =>
  z.string().transform((raw, ctx): number | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const n = Number(trimmed)
    if (
      !ENTIER_USUEL.test(trimmed) ||
      !Number.isInteger(n) ||
      n < borne.min ||
      n > borne.max
    ) {
      ctx.addIssue({ code: 'custom', message: borne.message })
      return z.NEVER
    }
    return n
  })

/**
 * `locaux.type_local_id SMALLINT REFERENCES types_locaux(id)` : les
 * identifiants du référentiel sont positifs et tiennent dans un SMALLINT. Le
 * champ est une liste déroulante — un id hors de ces bornes vient d'un lien
 * périmé, jamais d'une saisie.
 */
const optionalIntId = optionalInt({
  min: 1,
  max: 32_767,
  message: 'Type de local invalide : choisissez-en un dans la liste.',
})

// --- Bâtiment ---
// Vignette du pool (`miniature_id`) ou `null` — via le composant réutilisable
// MiniatureField (upload/crop), comme catégories/équipements.
// La colonne est un UUID : tout autre contenu part en 22P02 côté PostgREST.
const miniature = z.uuid('Vignette invalide : rechargez la page.').nullable()

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
  /** `NUMERIC(8,2)` + `CHECK (surface_m2 IS NULL OR surface_m2 > 0)`. */
  surface_m2: optionalNumber({
    min: 0,
    minExclusif: true,
    max: 999_999.99,
    message: 'La surface doit être comprise entre 0 et 999 999,99 m².',
  }),
  type_local_id: optionalIntId,
  miniature_id: miniature,
  /** Local chauffé / climatisé (remontée de la surface chauffée). */
  chauffe_climatise: z.boolean(),
  /** Hauteur sous plafond (m) → volume roulé par niveau / bâtiment (111). */
  hauteur_m: optionalNumber({
    min: 0,
    minExclusif: true,
    max: 99.99,
    message: 'La hauteur doit être comprise entre 0 et 99,99 m.',
  }),
  /** Effectif admissible (base du calcul d'effectif ERP) (111) — SMALLINT. */
  capacite_personnes: optionalInt({
    min: 0,
    max: 32_767,
    message: 'L’effectif doit être compris entre 0 et 32 767 personnes.',
  }),
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
