import { listStack } from '@/lib/responsive'
import { Skeleton } from '@/components/ui/skeleton'

interface ListRowSkeletonsProps {
  count?: number
}

/**
 * Squelettes de chargement calqués sur `ListRow` (variante média) : empilés via
 * `listStack`, hauteur fixe `h-20`, vignette carrée à gauche + deux lignes de
 * texte. À utiliser à la place de `CardSkeletons` partout où la liste réelle est
 * rendue en `ListRow`, pour que l'état de chargement ait la MÊME forme que le
 * contenu (pas de saut de mise en page « grille de cartes » → « lignes »).
 */
export function ListRowSkeletons({ count = 4 }: ListRowSkeletonsProps) {
  return (
    <div className={listStack}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-card flex h-20 items-stretch overflow-hidden rounded-lg border"
        >
          <Skeleton className="aspect-square h-full shrink-0 rounded-none" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
