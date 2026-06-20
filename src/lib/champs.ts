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

/**
 * Nettoie (trim des noms/unités, options de liste vides retirées + dédupliquées)
 * et VALIDE finement une liste de champs avant sérialisation : noms non vides,
 * uniques (insensible à la casse), et listes pourvues d'au moins une option.
 * Renvoie les champs prêts, ou un message d'erreur. Mutualisé entre le formulaire
 * de modèle et la page de détail (édition des caractéristiques au même endroit).
 */
export function prepareChamps(
  champs: Champ[],
): { ok: true; champs: Champ[] } | { ok: false; error: string } {
  const cleaned: Champ[] = champs.map((c) => ({
    ...c,
    cle: c.cle.trim(),
    // Oui/Non ne peut pas être « obligatoire » (false serait toujours valide) :
    // normalisation défensive qui réaligne aussi les champs legacy au prochain save.
    requis: c.type === 'oui-non' ? false : c.requis,
    // `unite` n'a de sens que pour un nombre : on l'efface si le type a change.
    unite: c.type === 'nombre' && c.unite?.trim() ? c.unite.trim() : undefined,
    options:
      c.type === 'liste'
        ? [
            ...new Set(
              (c.options ?? []).map((o) => o.trim()).filter((o) => o !== ''),
            ),
          ]
        : undefined,
  }))
  const cles = cleaned.map((c) => c.cle.toLowerCase())
  if (cles.some((k) => k === '')) {
    return { ok: false, error: 'Chaque champ doit avoir un nom.' }
  }
  if (new Set(cles).size !== cles.length) {
    return { ok: false, error: 'Les noms de champ doivent être uniques.' }
  }
  // Bornes de longueur ALIGNÉES sur champSchema (cle ≤ 60, unite ≤ 20). Sans ce
  // garde-fou, un champ trop long s'écrirait mais serait JETÉ en silence par
  // parseChamps au safeParse → caractéristique perdue sans erreur.
  const tropLong = cleaned.find((c) => c.cle.length > 60)
  if (tropLong) {
    return {
      ok: false,
      error: `Le nom « ${tropLong.cle} » dépasse 60 caractères.`,
    }
  }
  const uniteTropLongue = cleaned.find((c) => (c.unite?.length ?? 0) > 20)
  if (uniteTropLongue) {
    return {
      ok: false,
      error: `L’unité du champ « ${uniteTropLongue.cle} » dépasse 20 caractères.`,
    }
  }
  const sansOption = cleaned.find(
    (c) => c.type === 'liste' && (c.options ?? []).length === 0,
  )
  if (sansOption) {
    return {
      ok: false,
      error: `Le champ « ${sansOption.cle} » (liste) doit avoir au moins une option.`,
    }
  }
  // Garde-fou taille : le backend refuse specifications::text >= 10 000 caractères
  // (CHECK chk_modeles_equipements_specs_structure). On prévient avec une marge.
  if (JSON.stringify(serializeChamps(cleaned)).length > 9500) {
    return {
      ok: false,
      error:
        'Trop de caractéristiques (ou options trop longues) : réduis-en le nombre ou la taille.',
    }
  }
  return { ok: true, champs: cleaned }
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
