import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Gauge, Loader2 } from 'lucide-react'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { gammesQueries } from '@/features/gammes/queries'
import { ErrorState } from '@/components/common/error-state'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { calculerKpisOt, calculerSanteGammes } from '../stats'

interface KpiCardsProps {
  siteId: string
}

/** Cartes KPI : OT en retard / cette semaine / en cours + santé des gammes. */
export function KpiCards({ siteId }: KpiCardsProps) {
  const otQuery = useQuery(ordresTravailQueries.list(siteId))
  const gammesQuery = useQuery(gammesQueries.list(siteId))

  if (otQuery.isPending || gammesQuery.isPending) {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(12rem,100%),1fr))] gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }

  if (otQuery.isError || gammesQuery.isError) {
    return (
      <ErrorState
        message="Impossible de charger les indicateurs."
        onRetry={() => {
          void otQuery.refetch()
          void gammesQuery.refetch()
        }}
      />
    )
  }

  const ots = otQuery.data
  const kpis = calculerKpisOt(ots)
  const sante = calculerSanteGammes(
    gammesQuery.data.map((g) => g.nom),
    ots,
  )

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(12rem,100%),1fr))] gap-4">
      <KpiCard
        icon={AlertTriangle}
        label="OT en retard"
        value={kpis.enRetard}
        accent={kpis.enRetard > 0 ? 'destructive' : 'muted'}
        to="/ordres-travail"
      />
      <KpiCard
        icon={CalendarClock}
        label="OT cette semaine"
        value={kpis.cetteSemaine}
        to="/ordres-travail"
      />
      <KpiCard
        icon={Loader2}
        label="OT en cours"
        value={kpis.enCours}
        to="/ordres-travail"
      />
      <KpiCard
        icon={Gauge}
        label="Gammes à jour"
        value={
          sante.pourcentage === null ? '—' : `${String(sante.pourcentage)} %`
        }
        hint={
          sante.total === 0
            ? 'Aucune gamme'
            : `${String(sante.enRetard)} en retard / ${String(sante.total)}`
        }
        accent={
          sante.pourcentage !== null && sante.pourcentage < 100
            ? 'destructive'
            : 'muted'
        }
        to="/gammes"
      />
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'muted',
  to,
}: {
  icon: ComponentType<LucideProps>
  label: string
  value: number | string
  hint?: string
  accent?: 'destructive' | 'muted'
  to: string
}) {
  return (
    <Link to={to} className="block">
      <Card className="hover:border-ring min-w-0 gap-0 py-4 transition-colors">
        <CardContent className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              accent === 'destructive'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-muted-foreground truncate text-sm">{label}</p>
            {hint && (
              <p className="text-muted-foreground/80 truncate text-xs">
                {hint}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
