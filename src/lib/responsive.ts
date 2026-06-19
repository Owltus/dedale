/**
 * Classes de grille de cartes réutilisables, mobile-first (1 colonne sur
 * mobile, montée progressive selon la densité). À préférer aux grilles
 * `auto-fill minmax()` qui débordent sous 360px.
 */
export const cardGrid = {
  /** Listes denses : sites, localisations, prestataires. */
  compact:
    'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  /** Listes standard : gammes, équipements, OT, demandes, travaux, relevés. */
  default: 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const

/**
 * Empilement de lignes pleine largeur (cf. `ListRow`), mobile-first. Alternative
 * dense à `cardGrid` quand on veut des lignes à colonnes alignées (« tableau en
 * cartes ») plutôt qu'une grille de cartes : chaque ligne occupe toute la
 * largeur, séparées par un petit interstice.
 */
export const listStack = 'flex flex-col gap-2'
