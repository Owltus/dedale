import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarX2, FileSignature } from 'lucide-react'
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
import { formatDate } from '@/lib/date'
import { dashboardQueries } from '../queries'
import { joursAvant } from '../stats'

/** Fenêtre d'alerte : contrats dont la fin tombe dans les 60 prochains jours. */
const FENETRE_JOURS = 60

interface ContratsEcheanceProps {
  siteId: string
}

/** Liste compacte des contrats du site proches de leur date de fin. */
export function ContratsEcheance({ siteId }: ContratsEcheanceProps) {
  const { data, isPending, isError, refetch } = useQuery(
    dashboardQueries.contratsEcheance(siteId),
  )

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Contrats proches échéance</CardTitle>
        <CardDescription>
          Fins de contrat dans les {FENETRE_JOURS} prochains jours.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} className="py-6" />
        ) : (
          <Liste data={data} />
        )}
      </CardContent>
    </Card>
  )
}

interface ContratRow {
  id: string
  reference: string
  date_fin: string | null
  prestataires: { libelle: string } | null
  types_contrats: { libelle: string } | null
}

function Liste({ data }: { data: ContratRow[] }) {
  // date_fin est non-null (filtre serveur) ; on borne la fenêtre côté client.
  const proches = data
    .filter((c) => {
      if (!c.date_fin) return false
      const j = joursAvant(c.date_fin)
      return j <= FENETRE_JOURS // inclut les contrats déjà expirés
    })
    .slice(0, 6)

  if (proches.length === 0) {
    return (
      <EmptyState
        icon={FileSignature}
        title="Aucune échéance proche"
        description="Aucun contrat n'arrive à terme prochainement."
        className="py-6"
      />
    )
  }

  return (
    <ul className="divide-y">
      {proches.map((c) => {
        const jours = c.date_fin ? joursAvant(c.date_fin) : 0
        const expire = jours < 0
        return (
          <li key={c.id}>
            <Link
              to="/prestataires"
              className="hover:bg-accent -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.reference}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {c.prestataires?.libelle ?? 'Prestataire inconnu'}
                  {c.types_contrats?.libelle
                    ? ` · ${c.types_contrats.libelle}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={expire ? 'destructive' : 'secondary'}>
                  {expire
                    ? 'Expiré'
                    : jours === 0
                      ? "Aujourd'hui"
                      : `J−${String(jours)}`}
                </Badge>
                {c.date_fin && (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    <CalendarX2 className="size-3" />
                    {formatDate(c.date_fin)}
                  </span>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
