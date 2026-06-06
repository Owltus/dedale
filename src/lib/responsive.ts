/**
 * Classes de grille de cartes réutilisables, mobile-first (1 colonne sur
 * mobile, montée progressive selon la densité). À préférer aux grilles
 * `auto-fill minmax()` qui débordent sous 360px.
 */
export const cardGrid = {
  /** Listes denses : sites, localisations, prestataires. */
  compact:
    'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  /** Listes standard : gammes, équipements, OT, demandes, chantiers, relevés. */
  default: 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const
