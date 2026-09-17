import { champValeurEnTexte, type ChampValeur } from '@/lib/champs'

/**
 * Colonnes d'une OPÉRATION dans un CSV d'import, partagées par les deux
 * catalogues qui en contiennent : « Modèles d'opérations » (items d'un modèle)
 * et « Plan de maintenance » (opérations d'une gamme). Les deux tables
 * (`modeles_operations_items`, `operations`) ont les mêmes colonnes métier et
 * les mêmes règles (unité selon le TYPE, seuils selon l'UNITÉ) : un seul
 * endroit décrit ces colonnes à l'IA et les relit, pour que les deux imports
 * ne divergent jamais.
 */

export const COL_OPERATION = 'Opération'
export const COL_ORDRE = 'Ordre'
export const COL_TYPE = "Type d'opération"
export const COL_UNITE = 'Unité'
export const COL_SEUIL_MIN = 'Seuil minimum'
export const COL_SEUIL_MAX = 'Seuil maximum'
export const COL_OP_DESCRIPTION = "Description de l'opération"

/** Colonnes d'opération, dans l'ordre attendu dans l'en-tête du CSV. */
export const COLONNES_OPERATION = [
  COL_OPERATION,
  COL_ORDRE,
  COL_TYPE,
  COL_UNITE,
  COL_SEUIL_MIN,
  COL_SEUIL_MAX,
  COL_OP_DESCRIPTION,
] as const

/** Type d'opération du référentiel (`types_operations`). */
export interface TypeOperationRef {
  id: number
  libelle: string
  /** Type « Mesure » : l'opération porte une unité (et, selon elle, des seuils). */
  necessite_seuils: boolean
}

/** Unité du référentiel (`unites`). */
export interface UniteRef {
  id: number
  nom: string
  symbole: string | null
  /** Unité à bornes (°C, %, TH…) : des seuils min/max sont acceptés. */
  necessite_seuils: boolean
}

export interface OperationRefs {
  types: TypeOperationRef[]
  unites: UniteRef[]
}

/**
 * Valeurs d'une opération telles que les attendent `useCreateOperation`
 * (gammes) et `useCreateOperationItem` (modèles d'opérations) : tout en
 * chaînes, comme les formulaires dont elles empruntent le chemin d'écriture.
 */
export interface OperationCsvValues {
  nom: string
  ordre: string
  type_operation_id: string
  unite_id: string
  seuil_minimum: string
  seuil_maximum: string
  description: string
}

export interface OperationCsvResolue {
  values: OperationCsvValues
  /** Le type est « Mesure » → l'unité compte (cf. `resolveOperationFlags`). */
  aUnite: boolean
  /** L'unité porte des bornes → les seuils comptent. */
  requiresSeuils: boolean
}

const norm = (s: string) => s.trim().toLowerCase()

/** Libellé d'une unité tel qu'il apparaît dans le prompt (« Degrés Celsius (°C) »). */
export function libelleUnite(u: UniteRef): string {
  return u.symbole ? `${u.nom} (${u.symbole})` : u.nom
}

/**
 * Bloc du prompt décrivant les colonnes d'opération : énumère les valeurs
 * EXACTES du référentiel (types, unités) plutôt que de laisser l'IA inventer,
 * et explique les deux dépendances (unité ⇐ type Mesure, seuils ⇐ unité).
 */
export function blocColonnesOperation(refs: OperationRefs): string[] {
  const typesMesure = refs.types.filter((t) => t.necessite_seuils)
  const unitesSeuils = refs.unites.filter((u) => u.necessite_seuils)
  return [
    `- ${COL_OPERATION} — obligatoire. Le libellé de l'opération à effectuer (ex. « Vérifier la pression du circuit »).`,
    `- ${COL_ORDRE} — optionnel. Un entier : l'ordre d'exécution dans la liste (1, 2, 3…). Vide = 0.`,
    `- ${COL_TYPE} — obligatoire. UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : ${refs.types
      .map((t) => `« ${t.libelle} »`)
      .join(', ')}.`,
    `- ${COL_UNITE} — obligatoire UNIQUEMENT si ${COL_TYPE} vaut ${typesMesure
      .map((t) => `« ${t.libelle} »`)
      .join(
        ' ou ',
      )}, à laisser VIDE sinon. UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : ${refs.unites
      .map((u) => `« ${libelleUnite(u)} »`)
      .join(', ')}.`,
    `- ${COL_SEUIL_MIN} et ${COL_SEUIL_MAX} — optionnels, et UNIQUEMENT pour les unités à bornes (${unitesSeuils
      .map((u) => libelleUnite(u))
      .join(
        ', ',
      )}) ; à laisser VIDES partout ailleurs. Des nombres, virgule comme séparateur décimal (ex. « 6,5 »), le minimum inférieur ou égal au maximum.`,
    `- ${COL_OP_DESCRIPTION} — optionnel. Précisions sur le mode opératoire.`,
  ]
}

/** Lit un nombre écrit à la française (« 6,5 ») ou à l'anglaise (« 6.5 »). */
export function parseNombreFr(brut: string): number | null {
  const v = brut.trim().replace(/\s/g, '').replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Lit un « Oui »/« Non » tolérant (oui/non, o/n, true/false, 1/0, x). */
export function parseOuiNon(brut: string): boolean | null {
  const v = norm(brut)
  if (v === '') return null
  if (['oui', 'o', 'true', 'vrai', '1', 'x'].includes(v)) return true
  if (['non', 'n', 'false', 'faux', '0'].includes(v)) return false
  return null
}

/**
 * Valide et résout UNE ligne d'opération d'un CSV. `lire` donne la cellule
 * d'une colonne par son nom (l'appelant gère l'en-tête et l'indexation).
 * Fonction PURE : ne touche à rien, renvoie les valeurs prêtes pour la
 * mutation de création ou la liste des erreurs à afficher dans l'aperçu.
 */
export function resoudreOperation(
  lire: (colonne: string) => string,
  refs: OperationRefs,
):
  | { ok: true; operation: OperationCsvResolue }
  | { ok: false; erreurs: string[] } {
  const erreurs: string[] = []

  const nom = lire(COL_OPERATION).trim()
  if (nom === '') erreurs.push(`${COL_OPERATION} est obligatoire.`)

  const ordreBrut = lire(COL_ORDRE).trim()
  if (ordreBrut !== '' && !/^\d+$/.test(ordreBrut)) {
    erreurs.push(`${COL_ORDRE} : « ${ordreBrut} » n'est pas un entier positif.`)
  }

  const typeBrut = lire(COL_TYPE).trim()
  const type = refs.types.find((t) => norm(t.libelle) === norm(typeBrut))
  if (typeBrut === '') {
    erreurs.push(`${COL_TYPE} est obligatoire.`)
  } else if (!type) {
    erreurs.push(
      `${COL_TYPE} « ${typeBrut} » inconnu (valeurs possibles : ${refs.types
        .map((t) => t.libelle)
        .join(', ')}).`,
    )
  }

  // L'unité ne compte que pour un type « Mesure » ; ailleurs on l'ignore
  // silencieusement, exactement comme le formulaire qui l'efface (une IA peut
  // légitimement remplir « Unité » sur une simple vérification).
  const aUnite = type?.necessite_seuils ?? false
  const uniteBrut = lire(COL_UNITE).trim()
  let unite: UniteRef | undefined
  if (aUnite) {
    unite = refs.unites.find(
      (u) =>
        norm(libelleUnite(u)) === norm(uniteBrut) ||
        norm(u.nom) === norm(uniteBrut) ||
        (u.symbole !== null && norm(u.symbole) === norm(uniteBrut)),
    )
    if (uniteBrut === '') {
      erreurs.push(
        `${COL_UNITE} est obligatoire pour une opération de type « ${type?.libelle ?? ''} ».`,
      )
    } else if (!unite) {
      erreurs.push(
        `${COL_UNITE} « ${uniteBrut} » inconnue (valeurs possibles : ${refs.unites
          .map((u) => libelleUnite(u))
          .join(', ')}).`,
      )
    }
  }

  // Les seuils ne comptent que pour une unité à bornes — sinon ignorés, là
  // encore comme le formulaire.
  const requiresSeuils = aUnite && (unite?.necessite_seuils ?? false)
  let seuilMin = ''
  let seuilMax = ''
  if (requiresSeuils) {
    const minBrut = lire(COL_SEUIL_MIN).trim()
    const maxBrut = lire(COL_SEUIL_MAX).trim()
    const min = minBrut === '' ? null : parseNombreFr(minBrut)
    const max = maxBrut === '' ? null : parseNombreFr(maxBrut)
    if (minBrut !== '' && min === null)
      erreurs.push(`${COL_SEUIL_MIN} : « ${minBrut} » n'est pas un nombre.`)
    if (maxBrut !== '' && max === null)
      erreurs.push(`${COL_SEUIL_MAX} : « ${maxBrut} » n'est pas un nombre.`)
    if (min !== null && max !== null && min > max) {
      erreurs.push(`${COL_SEUIL_MIN} doit être inférieur ou égal au maximum.`)
    }
    if (min !== null) seuilMin = String(min)
    if (max !== null) seuilMax = String(max)
  }

  if (erreurs.length > 0) return { ok: false, erreurs }
  return {
    ok: true,
    operation: {
      values: {
        nom,
        ordre: ordreBrut,
        type_operation_id: String(type?.id ?? ''),
        unite_id: unite ? String(unite.id) : '',
        seuil_minimum: seuilMin,
        seuil_maximum: seuilMax,
        description: lire(COL_OP_DESCRIPTION).trim(),
      },
      aUnite,
      requiresSeuils,
    },
  }
}

/**
 * Résumé d'une opération pour l'aperçu ligne par ligne (« Vérifier la pression
 * — Mesure, bars, 2 → 4 »).
 */
export function resumeOperation(
  op: OperationCsvResolue,
  refs: OperationRefs,
): string {
  const type = refs.types.find(
    (t) => String(t.id) === op.values.type_operation_id,
  )
  const unite = refs.unites.find((u) => String(u.id) === op.values.unite_id)
  // Seuils réaffichés à la française (la valeur transmise à la base reste, elle,
  // un nombre à point décimal).
  const fr = (v: string) => v.replace('.', ',')
  const bornes =
    op.values.seuil_minimum !== '' || op.values.seuil_maximum !== ''
      ? ` (${fr(op.values.seuil_minimum) || '…'} → ${fr(op.values.seuil_maximum) || '…'})`
      : ''
  return [
    op.values.nom,
    type ? ` — ${type.libelle}` : '',
    unite ? `, ${libelleUnite(unite)}` : '',
    bornes,
  ].join('')
}

/** Valeur de champ affichable dans un résumé (types du JSONB `specifications`). */
export function texteValeur(v: ChampValeur): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  // Une double référence est un OBJET : `String()` en ferait « [object Object] ».
  // `champValeurEnTexte` rend la forme compacte « 3/12 », relisible à l'import.
  return champValeurEnTexte(v)
}
