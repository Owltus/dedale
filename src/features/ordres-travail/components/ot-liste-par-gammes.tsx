import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { OtCard } from './ot-card'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { listStack } from '@/lib/responsive'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'

/**
 * Liste (lecture) des ordres de travail rattachés à une ou plusieurs gammes,
 * TOUS statuts confondus, triés par date prévue décroissante. Un clic redirige
 * vers la page Ordres de travail, ouverte directement sur l'OT ciblé
 * (`?ot=<id>`). Réutilisée par le Plan de maintenance (panneau OT du palier
 * sous-catégorie) et par la fiche gamme (onglet « Ordres de travail »). Le rendu
 * d'une ligne est mutualisé via `OtCard` (même carte que la page liste).
 */
export function OtListeParGammes({
  siteId,
  gammeIds,
}: {
  siteId: string
  gammeIds: string[]
}) {
  const query = useQuery(ordresTravailQueries.byGammes(siteId, gammeIds))
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={<EmptyState icon={ClipboardList} title="Aucun ordre de travail" />}
    >
      {(ordres) => (
        <div className={listStack}>
          {ordres.map((ot) => (
            <OtCard key={ot.id} ot={ot} />
          ))}
        </div>
      )}
    </QueryState>
  )
}
