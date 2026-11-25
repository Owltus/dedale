// Caractéristiques libres (JSONB `specifications`) lues pour le connecteur.
//
// Le GABARIT vit sur le conteneur (modèle d'équipement, sous-catégorie de parc,
// type de lieu) ; l'objet (équipement, lieu) en garde un snapshot et remplit
// `valeur`. Miroir en lecture de src/lib/champs.ts (parseChamps,
// formatChampValeur) et src/features/equipements/format.ts (nomAfficheTexte) :
// mêmes formes, même rendu, pour que Claude dise ce que montre l'appli.

import { dateFr } from './commun.ts'

type Valeur = string | number | boolean | { a: string; b: string } | null

export type Champ = {
  cle: string
  type: string
  unite?: string
  options?: string[]
  libelleA?: string
  libelleB?: string
  requis?: boolean
  defaut?: Valeur
  valeur?: Valeur
}

/** Plafonds : un gabarit ou une liste de choix ne doit pas noyer la réponse. */
export const CHAMPS_MAX = 40
const OPTIONS_MAX = 30
const TEXTE_MAX = 200

const TYPES: Record<string, string> = {
  texte: 'Texte',
  nombre: 'Nombre',
  date: 'Date',
  'oui-non': 'Oui / Non',
  liste: 'Liste',
  'double-reference': 'Double référence',
}

const court = (t: string) => (t.length > TEXTE_MAX ? `${t.slice(0, TEXTE_MAX - 1)}…` : t)

/** Lit `specifications` en champs ; tolère l'ancien format plat `{ cle: valeur }`. Ne jette jamais. */
export function lireChamps(specifications: unknown): Champ[] {
  if (specifications === null || typeof specifications !== 'object' || Array.isArray(specifications)) return []
  const obj = specifications as Record<string, unknown>
  if (Array.isArray(obj.champs)) {
    return obj.champs.filter((c): c is Champ =>
      c !== null && typeof c === 'object' && typeof (c as Champ).cle === 'string' &&
      typeof (c as Champ).type === 'string'
    )
  }
  return Object.entries(obj).map(([cle, v]) => ({
    cle,
    type: 'texte',
    valeur: typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : null,
  }))
}

/** Valeur lisible d'un champ (« 12 kW », « Oui », « 3 / adresse 12 ») ; null si vide. */
export function valeurTexte(champ: Champ, v: Valeur | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object') {
    const a = String(v.a ?? '').trim()
    const b = String(v.b ?? '').trim()
    if (a === '' && b === '') return null
    const libelleB = champ.libelleB?.trim() ?? ''
    return libelleB === '' ? `${a || '—'}/${b || '—'}` : `${a || '—'} / ${libelleB} ${b || '—'}`
  }
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  const t = String(v)
  if (champ.type === 'oui-non') return t === 'true' ? 'Oui' : t === 'false' ? 'Non' : court(t)
  if (champ.type === 'date') return dateFr(t) ?? court(t)
  if (champ.type === 'nombre' && champ.unite) return `${t} ${champ.unite}`
  return court(t)
}

/** Caractéristiques renseignées d'un objet : { libellé: valeur }. */
export function caracteristiques(specifications: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of lireChamps(specifications).slice(0, CHAMPS_MAX)) {
    const t = valeurTexte(c, c.valeur)
    if (t !== null) out[court(c.cle)] = t
  }
  return out
}

/** Le gabarit d'un conteneur : ce qu'on saisit sur chaque objet créé dedans. */
export function gabarit(specifications: unknown) {
  return lireChamps(specifications).slice(0, CHAMPS_MAX).map((c) => {
    const defaut = valeurTexte(c, c.defaut)
    return {
      libelle: court(c.cle),
      type: TYPES[c.type] ?? c.type,
      ...(c.type === 'nombre' && c.unite ? { unite: c.unite } : {}),
      ...(c.type === 'liste' ? { options: (c.options ?? []).slice(0, OPTIONS_MAX).map(court) } : {}),
      ...(c.type === 'double-reference'
        ? { parts: [c.libelleA?.trim() || '1re part', c.libelleB?.trim() || '2de part'] }
        : {}),
      requis: c.requis === true,
      ...(defaut !== null ? { defaut } : {}),
    }
  })
}

/** Valeur de la caractéristique désignée par sa clé (valeur principale…), ou null. */
function valeurDe(specifications: unknown, cle: string | null | undefined): string | null {
  if (!cle) return null
  const c = lireChamps(specifications).find((x) => x.cle === cle)
  return c ? valeurTexte(c, c.valeur) : null
}

/**
 * Nom affiché d'un équipement, comme l'appli : sous-catégorie + valeur
 * principale, puis valeurs secondaire et tertiaire (« Détecteur Chambre 214 · Optique »).
 */
export function nomEquipement(e: {
  sous_categorie: string | null
  specifications: unknown
  valeur_principale?: string | null
  valeur_secondaire?: string | null
  valeur_tertiaire?: string | null
}): string {
  const type = e.sous_categorie?.trim() || 'Équipement'
  const principal = valeurDe(e.specifications, e.valeur_principale)
  return [
    principal ? `${type} ${principal}` : type,
    valeurDe(e.specifications, e.valeur_secondaire),
    valeurDe(e.specifications, e.valeur_tertiaire),
  ].filter(Boolean).join(' · ')
}
