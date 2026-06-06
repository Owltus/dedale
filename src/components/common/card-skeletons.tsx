import { cardGrid } from '@/lib/responsive'
import { Skeleton } from '@/components/ui/skeleton'

interface CardSkeletonsProps {
  count?: number
  /** Hauteur de chaque squelette (classe Tailwind). */
  height?: string
  /** Conteneur (grille ou liste). Défaut : cardGrid.default. */
  container?: string
}

/** Grille de N squelettes, pour l'état de chargement d'une liste. */
export function CardSkeletons({
  count = 4,
  height = 'h-40',
  container = cardGrid.default,
}: CardSkeletonsProps) {
  return (
    <div className={container}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  )
}
