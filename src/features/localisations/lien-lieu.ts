import { segOfUnique } from '@/lib/slug'

/** Élément nommé de l'arbre des lieux (bâtiment, niveau ou local). */
interface Noeud {
  id: string
  nom: string
}

/** Frères de chaque palier : TOUTE la liste non filtrée (invariant de symétrie). */
export interface FreresLieu {
  /** Bâtiments du site du lieu. */
  batiments: Noeud[]
  /** Niveaux du bâtiment du lieu. */
  niveaux: Noeud[]
  /** Locaux du niveau du lieu. */
  locaux: Noeud[]
}

/** Lieu à adresser : son id et ceux de ses conteneurs. */
export interface LieuAdressable {
  id: string
  niveauId: string
  batimentId: string
}

/**
 * Segments d'URL d'un lieu : `[bâtiment, niveau, lieu]`, chacun calculé par
 * `segOfUnique` parmi les MÊMES frères que l'explorateur utilise pour la
 * résolution — l'adresse se relit donc à l'identique. `null` si un palier est
 * introuvable parmi ses frères (lieu supprimé, déplacé, ou hors des sites).
 */
export function segmentsLieu(
  lieu: LieuAdressable,
  freres: FreresLieu,
): string[] | null {
  const batiment = freres.batiments.find((b) => b.id === lieu.batimentId)
  const niveau = freres.niveaux.find((n) => n.id === lieu.niveauId)
  const local = freres.locaux.find((l) => l.id === lieu.id)
  if (!batiment || !niveau || !local) return null
  return [
    segOfUnique(batiment, freres.batiments),
    segOfUnique(niveau, freres.niveaux),
    segOfUnique(local, freres.locaux),
  ]
}

/**
 * Cible de navigation TanStack d'un chemin de localisations (`[]` = racine,
 * `[bât]`, `[bât, niveau]`, `[bât, niveau, lieu]`) — à étaler dans un `<Link>`
 * ou un `navigate`. Source unique de la forme de l'adresse.
 */
export function lienLocalisations(segs: string[]) {
  return {
    to: '/localisations/$',
    params: { _splat: segs.join('/') },
  } as const
}
