import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareWarning } from 'lucide-react'
import { demandesQueries } from '@/features/demandes/queries'
import { diTitre } from '@/features/demandes/schemas'
import { statutBadgeVariant, statutLabel } from '@/features/demandes/etat'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/features/documents/format'

interface DernieresDemandesProps {
  siteId: string
}

/** Cinq dernières demandes d'intervention du site (titre dérivé du constat). */
export function DernieresDemandes({ siteId }: DernieresDemandesProps) {
  const { data, isPending, isError, refetch } = useQuery(
    demandesQueries.list(siteId),
  )

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Dernières demandes</CardTitle>
        <CardDescription>Derniers signalements du site.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} className="py-6" />
        ) : data.length === 0 ? (
          <EmptyState
            icon={MessageSquareWarning}
            title="Aucune demande"
            description="Aucun signalement pour ce site."
            className="py-6"
          />
        ) : (
          <ul className="divide-y">
            {data.slice(0, 5).map((d) => (
              <li key={d.id}>
                <Link
                  to="/demandes"
                  className="hover:bg-accent -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {diTitre(d.constat)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(d.date_constat)}
                    </p>
                  </div>
                  <Badge
                    variant={statutBadgeVariant(d.statut_di_id)}
                    className="shrink-0"
                  >
                    {statutLabel(d.statut_di_id)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
