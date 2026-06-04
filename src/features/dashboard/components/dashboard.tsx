import { useQuery } from '@tanstack/react-query'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import { KpiCards } from './kpi-cards'
import { ContratsEcheance } from './contrats-echeance'
import { DernieresDemandes } from './dernieres-demandes'
import { DerniersDocuments } from './derniers-documents'
import { PremiersPas } from './premiers-pas'

interface DashboardProps {
  siteId: string
}

/**
 * Corps du tableau de bord du site actif. Base quasi vierge (aucun OT) →
 * checklist d'amorçage ; sinon, cartes KPI + listes compactes.
 */
export function Dashboard({ siteId }: DashboardProps) {
  // La liste des OT sert à la fois aux KPI (cartes) et au choix « base vierge ».
  const otQuery = useQuery(ordresTravailQueries.list(siteId))

  if (otQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))] gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    )
  }

  if (otQuery.isError) {
    return (
      <ErrorState
        message="Impossible de charger le tableau de bord."
        onRetry={() => void otQuery.refetch()}
      />
    )
  }

  const aucunOt = otQuery.data.length === 0

  if (aucunOt) {
    return <PremiersPas aSite />
  }

  return (
    <div className="space-y-6">
      <KpiCards siteId={siteId} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))] gap-4">
        <DernieresDemandes siteId={siteId} />
        <ContratsEcheance siteId={siteId} />
        <DerniersDocuments siteId={siteId} />
      </div>
    </div>
  )
}
