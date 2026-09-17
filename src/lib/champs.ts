import { z } from 'zod'
import { formatDate } from '@/lib/date'
import { estLisible, messageIllisible, texteObligatoire } from '@/lib/texte-zod'

// Champs typés des caractéristiques (modèles + équipements), stockés dans le
// JSONB `specifications`. Voir plan/champs-types-equipements/.

/** Les 6 types de champ + leur libellé pour les sélecteurs. */
export const CHAMP_TYPES = [
  { value: 'texte', label: 'Texte' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'oui-non', label: 'Oui / Non' },
  { value: 'liste', label: 'Liste' },
  { value: 'double-reference', label: 'Double référence' },
] as const
export type ChampType = (typeof CHAMP_TYPES)[number]['value']

/**
 * Les deux parts d'une DOUBLE RÉFÉRENCE : un repère qui n'a de sens qu'entier —
 * zone et point d'une ZDM de détection incendie, bus et adresse d'un équipement
 * communicant. Deux valeurs, jamais l'une sans l'autre.
 *
 * Volontairement du TEXTE et non des nombres : une zone s'appelle parfois « A »
 * ou « 01 », et un zéro de tête disparaîtrait d'un nombre.
 */
export interface DoubleReference {
  a: string
  b: string
}

/** Valeur JSON d'un champ selon son type. */
export type ChampValeur = string | number | boolean | DoubleReference | null

const doubleReferenceSchema = z.object({ a: z.string(), b: z.string() })

const champValeurSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  doubleReferenceSchema,
  z.null(),
])

/**
 * La valeur est-elle une double référence ? Garde de TYPE : après elle,
 * TypeScript sait qu'on tient les deux parts. Le seul autre membre objet de
 * l'union est `null`, écarté d'abord.
 */
export function estDoubleReference(v: ChampValeur): v is DoubleReference {
  return typeof v === 'object' && v !== null
}

/**
 * Texte d'une double référence pour un ÉCHANGE (export CSV, recherche) : la
 * forme compacte « 3/12 », celle que `resoudreValeurTexte` sait relire. Sortir
 * la valeur par `String()` donnerait « [object Object] » — c'est le piège que
 * l'élargissement de `ChampValeur` a ouvert dans tout le code d'import/export.
 */
export function doubleReferenceEnTexte(v: DoubleReference): string {
  const a = v.a.trim()
  const b = v.b.trim()
  return a === '' && b === '' ? '' : `${a}/${b}`
}

/**
 * Valeur d'un champ en TEXTE BRUT, pour un échange machine (CSV) — à ne pas
 * confondre avec `formatChampValeur`, qui met en forme pour l'ŒIL (unité,
 * « Oui », date française, libellé de 2de part).
 *
 * Source unique : tout code qui sérialise une `ChampValeur` doit passer par ici,
 * sinon une double référence s'écrit « [object Object] ».
 */
export function champValeurEnTexte(valeur: ChampValeur): string {
  if (valeur === null) return ''
  if (estDoubleReference(valeur)) return doubleReferenceEnTexte(valeur)
  return String(valeur)
}

/**
 * Un champ typé. Le MODÈLE porte la définition (avec `defaut`) ; l'ÉQUIPEMENT
 * garde un snapshot de la définition et remplit `valeur`.
 */
export const champSchema = z.object({
  cle: texteObligatoire('Le nom du champ est obligatoire').max(60),
  type: z.enum([
    'texte',
    'nombre',
    'date',
    'oui-non',
    'liste',
    'double-reference',
  ]),
  /** Pertinent si type = nombre (ex. kW, bars). */
  unite: z.string().trim().max(20).optional(),
  /** Choix possibles, requis si type = liste. */
  options: z.array(z.string().trim().min(1)).optional(),
  /**
   * Libellé de la 1re part d'une double référence (ex. « Zone », « Bus »).
   * Sert à la SAISIE : c'est l'étiquette de la première case.
   */
  libelleA: z.string().trim().max(30).optional(),
  /**
   * Libellé de la 2de part (ex. « Point », « adresse »). Sert à la saisie, et
   * commande la LECTURE : rempli, il apparaît dans la valeur affichée
   * (« 2 / adresse 45 ») ; vide, la forme reste compacte (« 3/12 »).
   */
  libelleB: z.string().trim().max(30).optional(),
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
    // Les deux libellés n'ont de sens que pour une double référence : on les
    // efface si le type a changé, comme `unite` et `options` au-dessus.
    libelleA:
      c.type === 'double-reference' && c.libelleA?.trim()
        ? c.libelleA.trim()
        : undefined,
    libelleB:
      c.type === 'double-reference' && c.libelleB?.trim()
        ? c.libelleB.trim()
        : undefined,
  }))
  const cles = cleaned.map((c) => c.cle.toLowerCase())
  if (cles.some((k) => k === '')) {
    return { ok: false, error: 'Chaque champ doit avoir un nom.' }
  }
  // Un nom fait de seuls caractères invisibles (largeur nulle, joignoirs…)
  // survit au `.trim()` ci-dessus : il s'écrirait, puis `parseChamps` le
  // JETTERAIT en silence à la relecture (champSchema exige du lisible).
  const invisible = cleaned.find((c) => !estLisible(c.cle))
  if (invisible) {
    return { ok: false, error: messageIllisible('nom') }
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
  // Le 1er libellé est OBLIGATOIRE : c'est l'étiquette de la première case de
  // saisie. Sans lui, l'utilisateur voit deux cases nues et ne sait pas laquelle
  // porte la zone et laquelle porte le point. Le 2d reste facultatif — c'est lui
  // qui commande la forme d'affichage.
  const sansLibelle = cleaned.find(
    (c) => c.type === 'double-reference' && (c.libelleA ?? '') === '',
  )
  if (sansLibelle) {
    return {
      ok: false,
      error: `Le champ « ${sansLibelle.cle} » (double référence) doit nommer sa première partie (ex. « Zone », « Bus »).`,
    }
  }
  // Bornes ALIGNÉES sur champSchema (libellés ≤ 30). Sans ce garde-fou, le champ
  // s'écrirait puis serait JETÉ en silence par parseChamps à la relecture.
  const libelleTropLong = cleaned.find(
    (c) => (c.libelleA?.length ?? 0) > 30 || (c.libelleB?.length ?? 0) > 30,
  )
  if (libelleTropLong) {
    return {
      ok: false,
      error: `Les libellés du champ « ${libelleTropLong.cle} » dépassent 30 caractères.`,
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

/**
 * Met en forme une double référence, SANS le nom du champ — comme les cinq
 * autres types, qui rendent la valeur seule (une date rend la date, pas
 * « Date de pose : … »). L'écran affiche le nom à gauche : la fiche lit donc
 * « ZDM │ 3/12 » et « Bus │ 2 / adresse 45 ».
 *
 * UNE règle, deux résultats, commandés par le 2d libellé :
 *   - vide    → forme compacte, « 3/12 » ;
 *   - rempli  → le mot apparaît, « 2 / adresse 45 ».
 *
 * Une seule part renseignée reste lisible (« 3/— ») : mieux vaut montrer le
 * trou que de faire disparaître la saisie.
 */
function formatDoubleReference(champ: Champ, v: DoubleReference): string {
  const a = v.a.trim()
  const b = v.b.trim()
  if (a === '' && b === '') return '—'
  const gauche = a === '' ? '—' : a
  const droite = b === '' ? '—' : b
  const libelleB = champ.libelleB?.trim() ?? ''
  return libelleB === ''
    ? `${gauche}/${droite}`
    : `${gauche} / ${libelleB} ${droite}`
}

/** Met en forme une valeur de champ pour la LECTURE selon son type. */
export function formatChampValeur(champ: Champ, valeur: ChampValeur): string {
  if (valeur === null || valeur === '') return '—'
  // Branché AVANT tout le reste : une double référence est un objet, que le
  // `typeof valeur === 'number' ? … : valeur` plus bas rendrait tel quel.
  if (estDoubleReference(valeur)) return formatDoubleReference(champ, valeur)
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

/**
 * Convertit la valeur BRUTE d'une cellule (import CSV) vers la valeur typée
 * d'un champ, ou rend une erreur en clair. Source unique des règles de saisie
 * « à la française » : virgule décimale pour les nombres, `JJ/MM/AAAA` pour
 * les dates, « Oui » / « Non » pour les booléens, valeur de liste recopiée
 * (insensible à la casse). Vide → valeur par défaut du champ, sauf si requis.
 * Partagée par les imports d'équipements et de locaux : leurs formats ne
 * doivent jamais diverger.
 */
export function resoudreValeurTexte(
  champ: Champ,
  brut: string | undefined,
): { ok: true; valeur: ChampValeur } | { ok: false; erreur: string } {
  const v = (brut ?? '').trim()
  if (v === '') {
    if (champ.requis) {
      return { ok: false, erreur: `« ${champ.cle} » est obligatoire.` }
    }
    return { ok: true, valeur: champ.defaut }
  }
  switch (champ.type) {
    case 'liste': {
      const option = (champ.options ?? []).find(
        (o) => o.trim().toLowerCase() === v.toLowerCase(),
      )
      if (!option) {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » n'est pas une valeur autorisée (${(champ.options ?? []).join(', ')}).`,
        }
      }
      return { ok: true, valeur: option }
    }
    case 'nombre': {
      // Forme VALIDÉE avant conversion : `Number()` reconnaît aussi les
      // littéraux JavaScript non décimaux et les convertit en silence
      // (« 0x10 » → 16, « 0b101 » → 5, « 0o17 » → 15). Une référence
      // d'équipement saisie dans une colonne numérique deviendrait donc un
      // nombre faux, sans le moindre avertissement. Seul un décimal est
      // accepté : signe optionnel, chiffres, virgule ou point décimal,
      // notation scientifique. `Infinity` et les débordements (« 1e400 »)
      // restent traités par le `Number.isFinite` ci-dessous.
      const nombreBrut = v.replace(',', '.')
      const n = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(nombreBrut)
        ? Number(nombreBrut)
        : Number.NaN
      if (!Number.isFinite(n)) {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » n'est pas un nombre.`,
        }
      }
      return { ok: true, valeur: n }
    }
    case 'oui-non': {
      if (v.toLowerCase() === 'oui') return { ok: true, valeur: true }
      if (v.toLowerCase() === 'non') return { ok: true, valeur: false }
      return {
        ok: false,
        erreur: `« ${champ.cle} » : « ${v} » doit être « Oui » ou « Non ».`,
      }
    }
    case 'date': {
      const iso = parseDateFrVersIso(v)
      if (iso === null) {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » n'est pas une date valide (JJ/MM/AAAA).`,
        }
      }
      return { ok: true, valeur: iso }
    }
    case 'double-reference': {
      // Format d'import ALIGNÉ sur l'affichage compact : « 3/12 ». C'est ce que
      // l'utilisateur lit à l'écran, donc ce qu'il recopiera dans son tableur.
      // Découpe sur le PREMIER séparateur seulement : une 2de part contenant
      // elle-même un « / » reste intacte plutôt que d'être tronquée en silence.
      const i = v.indexOf('/')
      if (i === -1) {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » doit s'écrire en deux parties séparées par « / » (ex. 3/12).`,
        }
      }
      const partA = v.slice(0, i).trim()
      const partB = v.slice(i + 1).trim()
      if (partA === '' || partB === '') {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » doit renseigner les DEUX parties (ex. 3/12).`,
        }
      }
      return { ok: true, valeur: { a: partA, b: partB } }
    }
    case 'texte':
    default:
      return { ok: true, valeur: v }
  }
}

/**
 * `JJ/MM/AAAA` → `YYYY-MM-DD`, ou `null` si la date n'existe pas. Rejette les
 * dates qui « débordent » (31/02), que `Date` recalerait en silence.
 */
export function parseDateFrVersIso(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [, jj, mm, aaaa] = m as unknown as [string, string, string, string]
  const j = Number(jj)
  const mo = Number(mm)
  const iso = `${aaaa}-${mo.toString().padStart(2, '0')}-${j.toString().padStart(2, '0')}`
  const d = new Date(iso)
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(aaaa) ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== j
  ) {
    return null
  }
  return iso
}
