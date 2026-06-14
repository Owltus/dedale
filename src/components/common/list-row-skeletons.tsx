import { listStack } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface ListRowSkeletonsProps {
  count?: number
  /**
   * Variante FINE (`h-12`, une seule ligne de texte) calquée sur les lignes
   * d'opérations (`OperationRow`) et de modèles liés. Défaut : variante média
   * `h-20` (deux lignes), calquée sur la liste principale.
   */
  dense?: boolean
}

/**
 * Squelettes de chargement calqués sur `ListRow` : empilés via `listStack`,
 * hauteur fixe (`h-20` standard, `h-12` en `dense`), vignette carrée à gauche +
 * lignes de texte. À utiliser à la place de `CardSkeletons` partout où la liste
 * réelle est rendue en `ListRow`, pour que l'état de chargement ait la MÊME forme
 * que le contenu (pas de saut de mise en page « bloc » / « grille » → « lignes »).
 */
export function ListRowSkeletons({
  count = 4,
  dense = false,
}: ListRowSkeletonsProps) {
  return (
    <div className={listStack}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'bg-card flex items-stretch overflow-hidden rounded-lg border',
            dense ? 'h-12' : 'h-20',
          )}
        >
          <Skeleton className="aspect-square h-full shrink-0 rounded-none" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4">
            <Skeleton className="h-4 w-2/5" />
            {!dense && <Skeleton className="h-3 w-3/5" />}
          </div>
        </div>
      ))}
    </div>
  )
}
