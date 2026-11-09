import type { Database } from '@/lib/database.types'

type GammeNature = Database['public']['Enums']['gamme_nature']

/**
 * Les trois natures d'OBLIGATION (décision PO 08/11/2026) et leur couleur de
 * repère, partagée par le planning (contour des cellules) et la frise des
 * obligations du tableau de bord. Couleurs HORS de la palette des statuts :
 * noir/blanc, turquoise, indigo (le framboise, jugé agressif, a été retiré le
 * 09/11/2026). L'ordre est celui de la priorité d'affichage : une cellule qui
 * mélange plusieurs de ces natures prend la première.
 */
export const NATURES_OBLIGATION: readonly {
  nature: GammeNature
  libelle: string
  /** Classe Tailwind d'anneau (planning). */
  ring: string
  /** Couleur CSS (SVG de la frise). */
  couleur: string
}[] = [
  {
    nature: 'controle_reglementaire',
    libelle: 'Contrôle réglementaire',
    ring: 'ring-primary',
    couleur: 'var(--primary)',
  },
  {
    nature: 'hygiene_sanitaire',
    libelle: 'Hygiène et sanitaire',
    ring: 'ring-turquoise',
    couleur: 'var(--turquoise)',
  },
  {
    nature: 'formation_habilitation',
    libelle: 'Formation et habilitation',
    ring: 'ring-indigo',
    couleur: 'var(--indigo)',
  },
]
