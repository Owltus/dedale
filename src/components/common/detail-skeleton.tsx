import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface DetailSkeletonProps {
  /**
   * Annonce la carte d'en-tête (`DetailHeaderCard`, `h-20` + `mb-4`). Défaut
   * `true` — la quasi-totalité des fiches en ont une.
   */
  headerCard?: boolean
  /** Nombre de blocs de contenu annoncés sous la carte. Défaut 3. */
  blocs?: number
  className?: string
}

/**
 * Squelette d'une FICHE DÉTAIL — carte d'en-tête puis blocs de contenu.
 *
 * À distinguer de `ListRowSkeletons`, qui annonce des lignes de liste : une
 * fiche n'est pas une liste, et l'annoncer comme telle fait sauter la mise en
 * page au chargement. Les quatre fiches de l'app avaient jusqu'ici quatre
 * écrans de chargement différents, dont un unique pavé gris `h-96` qui
 * n'annonçait la structure de rien.
 *
 * Les hauteurs reprennent celles des briques réelles (`DetailHeaderCard` :
 * `h-20` + `mb-4`) : même principe que `MEDIA_HEIGHT` pour les listes — une
 * seule source, donc aucun décalage possible entre l'annonce et le rendu.
 */
export function DetailSkeleton({
  headerCard = true,
  blocs = 3,
  className,
}: DetailSkeletonProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {headerCard && <Skeleton className="mb-4 h-20 w-full" />}
      <div className="flex flex-col gap-3">
        {Array.from({ length: blocs }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}
