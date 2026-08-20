import type { ComponentType } from 'react'

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
export function RowMediaIcon({
  icon: Icon,
  size,
}: {
  /** Icône lucide OU composant SVG maison (ex. `PdfFileIcon`) recevant `className`. */
  icon: ComponentType<{ className?: string }>
  /**
   * Densité de la `ListRow` porteuse — l'icône suit pour rester proportionnée
   * dans le carré média (`h-11` en `xs`). Omis = comportement historique
   * (`size-10`), inchangé pour tous les appelants existants.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg'
}) {
  return (
    <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
      <Icon className={size === 'xs' ? 'size-5' : 'size-10'} />
    </span>
  )
}
