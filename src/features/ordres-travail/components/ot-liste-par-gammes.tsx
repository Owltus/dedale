import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { calculerRelevesParOt } from '@/features/ordres-travail/releves'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import { OtCard } from './ot-card'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { listStack } from '@/lib/responsive'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'

/**
 * Liste (lecture) des ordres de travail rattachés à une ou plusieurs gammes,
 * tous statuts confondus. Réutilisée par le Plan de maintenance (panneau OT du
 * palier sous-catégorie) et par la fiche gamme (onglet « Ordres de travail »).
 *
 * Affichage STRICTEMENT identique à la page liste « Ordres de travail » : même
 * carte (`OtCard`), même TRI par urgence (`trierOtParUrgence`) et même RELEVÉ de
 * consommation (`calculerRelevesParOt`) — toutes des logiques exportées et
 * partagées. Une évolution de l'une se répercute partout.
 */
export function OtListeParGammes({
  siteId,
  gammeIds,
}: {
  siteId: string
  gammeIds: string[]
}) {
  const query = useQuery(ordresTravailQueries.byGammes(siteId, gammeIds))
  // Relevés des compteurs cumulatifs du site (1 requête groupée, sans N+1) → map
  // `ot_id → « 80 kWh »`. Site-scopé (un précédent peut vivre sur un autre OT du
  // site) : on charge tout le site, on filtre par OT au rendu — comme la page liste.
  const relevesQuery = useQuery(ordresTravailQueries.relevesListe(siteId))
  const releveParOt = useMemo(
    () => calculerRelevesParOt(relevesQuery.data ?? []),
    [relevesQuery.data],
  )
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={<EmptyState icon={ClipboardList} title="Aucun ordre de travail" />}
    >
      {(ordres) => (
        <div className={listStack}>
          {trierOtParUrgence(ordres).map((ot) => (
            <OtCard
              key={ot.id}
              ot={ot}
              releve={releveParOt.get(ot.id) ?? null}
            />
          ))}
        </div>
      )}
    </QueryState>
  )
}
