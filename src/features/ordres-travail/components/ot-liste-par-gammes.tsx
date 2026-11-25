import { VirtualList } from '@/components/common/virtual-list'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import type { DocumentMeta } from '@/features/documents/format'
import { calculerRelevesParOt } from '@/features/ordres-travail/releves'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import { OtCard } from './ot-card'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
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
  const releveParOt = calculerRelevesParOt(relevesQuery.data ?? [])
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  // Tri par urgence mémoïsé : ne se recalcule que quand les OT changent (pas à
  // chaque re-render du split parent), au même titre que `releveParOt`.
  const ordresTries = trierOtParUrgence(query.data ?? [])
  // Documents rattachés aux OT du site, en UNE requête groupée filtrée par site
  // (pas par liste d'ids — cf. `ordresTravailQueries.documentsParOt`).
  const documentsQuery = useQuery(ordresTravailQueries.documentsParOt(siteId))
  const documentsParOt =
    documentsQuery.data ?? new Map<string, DocumentMeta[]>()
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={<EmptyState icon={ClipboardList} title="Aucun ordre de travail" />}
    >
      {() => (
        // Virtualisée : une sous-catégorie ou une gamme mensuelle ancienne peut
        // porter des centaines d'OT ; seules les cartes visibles sont montées.
        <VirtualList
          items={ordresTries}
          getKey={(ot) => ot.id}
          renderItem={(ot) => (
            <OtCard
              ot={ot}
              urlOf={urlOf}
              refreshMiniatures={refreshMiniatures}
              releve={releveParOt.get(ot.id) ?? null}
              documents={documentsParOt.get(ot.id) ?? []}
            />
          )}
        />
      )}
    </QueryState>
  )
}
