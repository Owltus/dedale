import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareWarning } from 'lucide-react'
import { demandesQueries } from '@/features/demandes/queries'
import { diTitre } from '@/features/demandes/schemas'
import { statutLabel, statutTone } from '@/features/demandes/etat'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { EmptyState } from '@/components/common/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { StatusBadge } from '@/components/common/status-badge'
import { formatDate } from '@/lib/date'

interface DernieresDemandesProps {
  siteId: string
}

/** Cinq dernières demandes d'intervention du site (titre dérivé du constat). */
export function DernieresDemandes({ siteId }: DernieresDemandesProps) {
  const query = useQuery(demandesQueries.list(siteId))

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Dernières demandes</CardTitle>
        <CardDescription>Derniers signalements du site.</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          query={query}
          pending={
            <CardSkeletons count={4} height="h-10" container="space-y-2" />
          }
          errorClassName="py-6"
          empty={
            <EmptyState
              icon={MessageSquareWarning}
              title="Aucune demande"
              description="Aucun signalement pour ce site."
              className="py-6"
            />
          }
        >
          {(data) => (
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
                    <StatusBadge
                      tone={statutTone(d.statut_di_id)}
                      className="shrink-0"
                    >
                      {statutLabel(d.statut_di_id)}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
    </Card>
  )
}
