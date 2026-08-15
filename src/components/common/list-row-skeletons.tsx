import { listStack } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { MEDIA_HEIGHT, type ListRowSize } from '@/components/common/list-row'

interface ListRowSkeletonsProps {
  count?: number
  /**
   * MÊME densité que les `ListRow` réelles de la liste (`xs` h-11 · `sm` h-14 ·
   * `md` h-20 · `lg` h-24). Les hauteurs viennent de `MEDIA_HEIGHT`, la table
   * exportée par `ListRow` : une seule source, donc aucun écart possible entre
   * le squelette et le contenu qu'il annonce.
   */
  size?: ListRowSize
}

/**
 * Squelettes de chargement calqués sur `ListRow` : empilés via `listStack`,
 * vignette carrée à gauche + lignes de texte, à la hauteur de la densité
 * demandée. À utiliser à la place de `CardSkeletons` partout où la liste réelle
 * est rendue en `ListRow`, pour que l'état de chargement ait la MÊME forme ET la
 * MÊME hauteur que le contenu — sans quoi la page saute au premier rendu.
 *
 * Passer le `size` des lignes réelles. En cas de doute, l'omettre : `md` est la
 * densité de la liste principale.
 */
export function ListRowSkeletons({
  count = 4,
  size = 'md',
}: ListRowSkeletonsProps) {
  // Sous-titre : seules les densités hautes en affichent un (les lignes fines
  // n'ont qu'un titre) — le squelette suit, sinon il annonce une ligne à deux
  // lignes de texte là où le contenu n'en aura qu'une.
  const avecSousTitre = size === 'md' || size === 'lg'

  return (
    <div className={listStack}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-stretch overflow-hidden rounded-lg border bg-card',
            MEDIA_HEIGHT[size],
          )}
        >
          <Skeleton className="aspect-square h-full shrink-0 rounded-none" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4">
            <Skeleton className="h-4 w-2/5" />
            {avecSousTitre && <Skeleton className="h-3 w-3/5" />}
          </div>
        </div>
      ))}
    </div>
  )
}
