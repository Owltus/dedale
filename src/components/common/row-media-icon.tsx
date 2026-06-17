import type { LucideIcon } from 'lucide-react'

/**
 * Zone média CARRÉE d'une `ListRow` pour une entité SANS image (sites,
 * prestataires, utilisateurs, contrats…) : icône centrée sur fond atténué,
 * remplissant le carré pleine hauteur. Même rendu que le repli de
 * `MiniatureThumb` (pages illustrées : Équipements, Localisation…) → listes
 * alignées et homogènes dans toute l'app. À passer au prop `media` de `ListRow`.
 *
 * Source UNIQUE de la taille/forme de cette zone : un ajustement ici se répercute
 * partout où des lignes « icône seule » sont affichées.
 */
export function RowMediaIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="bg-muted text-muted-foreground flex size-full items-center justify-center">
      <Icon className="size-10" />
    </span>
  )
}
