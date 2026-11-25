import { formatChampValeur, parseChamps } from '@/lib/champs'
import type { Tables } from '@/lib/database.types'

type Local = Tables<'locaux'>

/** Surface d'un lieu (« 42 m² »), `null` si non renseignée. */
export function surfaceLocal(l: Pick<Local, 'surface_m2'>): string | null {
  return l.surface_m2 === null ? null : `${String(l.surface_m2)} m²`
}

/**
 * Caractéristiques d'un lieu, dans l'ordre d'affichage : mesures, équipements
 * de confort, puis caractéristiques du type (112) — seules celles qui portent
 * une valeur, pour ne pas allonger le texte inutilement. Source unique de la
 * ligne de l'arbre ET de l'en-tête de la fiche du lieu.
 */
export function caracteristiquesLocal(
  l: Pick<
    Local,
    | 'hauteur_m'
    | 'capacite_personnes'
    | 'chauffe_climatise'
    | 'accessible_pmr'
    | 'specifications'
  >,
): string[] {
  return [
    l.hauteur_m === null ? null : `${String(l.hauteur_m)} m`,
    l.capacite_personnes === null
      ? null
      : `${String(l.capacite_personnes)} pers.`,
    l.chauffe_climatise ? 'Chauffé/climatisé' : null,
    l.accessible_pmr ? 'PMR' : null,
    ...parseChamps(l.specifications)
      .filter(
        (c) => c.valeur !== null && c.valeur !== undefined && c.valeur !== '',
      )
      .map((c) => `${c.cle} : ${formatChampValeur(c, c.valeur ?? null)}`),
  ].filter((p): p is string => p !== null)
}
