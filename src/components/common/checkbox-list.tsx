import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

interface CheckboxListProps extends ComponentProps<'div'> {
  /**
   * Encadre la liste (bordure + fond) : pour une zone de sélection posée dans le
   * corps d'un dialogue. Sans cadre, la liste se fond dans son conteneur.
   */
  bordered?: boolean
}

/**
 * Zone défilante d'une liste COCHABLE (`CheckRow`).
 *
 * Elle porte **la hauteur maximale**, jusqu'ici posée à la main et divergente :
 * `max-h-72` dans la coquille de checklist, `max-h-72` dans la copie de contenu,
 * aucune borne dans l'invitation d'utilisateur — où une longue liste de sites
 * poussait donc le pied du dialogue hors de l'écran.
 *
 * Même principe que `MEDIA_HEIGHT` pour les listes de données : la mesure
 * appartient à la brique, pas à l'appelant (ADR 0006).
 *
 * Accepte les props d'un `div` (`role`, `aria-labelledby`…) : sans cela, le
 * consommateur qui a besoin d'un attribut recopie les classes à côté — et c'est
 * exactement comme ça que les trois hauteurs ont divergé.
 */
export function CheckboxList({
  children,
  bordered = false,
  className,
  ...props
}: CheckboxListProps) {
  return (
    <div
      className={cn(
        'max-h-72 overflow-y-auto',
        bordered && 'rounded-md border p-3',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
