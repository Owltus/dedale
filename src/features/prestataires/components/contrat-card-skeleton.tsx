import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Squelette d'une liste de `ContratCard`.
 *
 * Une carte de contrat fait ~250 px (statut détaillé, progression, avenants,
 * documents) : l'annoncer avec `ListRowSkeletons` promettait des lignes de
 * 80 px, soit un saut de mise en page de plus de 150 px par carte au
 * chargement. Le squelette reprend donc l'enveloppe `Card` réelle.
 *
 * Local à la feature tant qu'il n'a qu'un consommateur : une brique commune
 * née orpheline est précisément ce que la règle D5 interdit.
 */
export function ContratCardSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-2 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
