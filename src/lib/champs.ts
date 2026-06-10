import { z } from 'zod'
import { formatDate } from '@/lib/date'

// Champs typés des caractéristiques (modèles + équipements), stockés dans le
// JSONB `specifications`. Voir plan/champs-types-equipements/.

/** Les 5 types de champ + leur libellé pour les sélecteurs. */
export const CHAMP_TYPES = [
  { value: 'texte', label: 'Texte' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'oui-non', label: 'Oui / Non' },
  { value: 'liste', label: 'Liste' },
] as const
export type ChampType = (typeof CHAMP_TYPES)[number]['value']

/** Valeur JSON d'un champ selon son type. */
export type ChampValeur = string | number | boolean | null

const champValeurSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

/**
 * Un champ typé. Le MODÈLE porte la définition (avec `defaut`) ; l'ÉQUIPEMENT
 * garde un snapshot de la définition et remplit `valeur`.
 */
export const champSchema = z.object({
  cle: z.string().trim().max(60),
  type: z.enum(['texte', 'nombre', 'date', 'oui-non', 'liste']),
  /** Pertinent si type = nombre (ex. kW, bars). */
  unite: z.string().trim().max(20).optional(),
  /** Choix possibles, requis si type = liste. */
  options: z.array(z.string().trim().min(1)).optional(),
  requis: z.boolean(),
  /** Valeur par défaut (sur le modèle). */
  defaut: champValeurSchema,
  /** Valeur saisie (sur l'équipement). */
  valeur: champValeurSchema.optional(),
})
export type Champ = z.infer<typeof champSchema>

/**
 * Lit le JSONB `specifications` en liste de champs. Tolère l'ANCIEN format plat
 * `{ cle: valeur }` (converti en champs « texte »). Ne jette jamais : une forme
 * inconnue renvoie `[]`.
 */
export function parseChamps(specifications: unknown): Champ[] {
  if (specifications === null || typeof specifications !== 'object') return []
  const obj = specifications as Record<string, unknown>
  if (Array.isArray(obj.champs)) {
    const out: Champ[] = []
    for (const c of obj.champs) {
      const parsed = champSchema.safeParse(c)
      if (parsed.success) out.push(parsed.data)
    }
    return out
  }
  // Legacy : objet plat { cle: valeur } → champs texte (compat lecture/édition).
  return Object.entries(obj).map(([cle, valeur]) => ({
    cle,
    type: 'texte' as const,
    requis: false,
    defaut: null,
    valeur:
      typeof valeur === 'string'
        ? valeur
        : typeof valeur === 'number' || typeof valeur === 'boolean'
          ? String(valeur)
          : null,
  }))
}

/** Sérialise une liste de champs pour le JSONB `specifications`. */
export function serializeChamps(champs: Champ[]): { champs: Champ[] } {
  return { champs }
}

/** Met en forme une valeur de champ pour la LECTURE selon son type. */
export function formatChampValeur(champ: Champ, valeur: ChampValeur): string {
  if (valeur === null || valeur === '') return '—'
  if (champ.type === 'oui-non') return valeur ? 'Oui' : 'Non'
  const txt =
    typeof valeur === 'number'
      ? String(valeur)
      : typeof valeur === 'boolean'
        ? valeur
          ? 'Oui'
          : 'Non'
        : valeur
  if (champ.type === 'date') return formatDate(txt)
  if (champ.type === 'nombre')
    return champ.unite ? `${txt} ${champ.unite}` : txt
  return txt
}
