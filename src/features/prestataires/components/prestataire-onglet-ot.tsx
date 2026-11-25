import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { prestatairesQueries } from '../queries'
import { OtCard } from '@/features/ordres-travail/components/ot-card'
import {
  matchStatutOt,
  statutOtFilterOptions,
} from '@/features/ordres-travail/schemas'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import type { DocumentMeta } from '@/features/documents/format'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ListPageBody } from '@/components/common/list-page-body'
import { FILTRE_NON_TERMINES } from '@/components/common/list-filter-bar'
import type { MiniatureAccess } from './prestataire-onglets'
import { normaliserRecherche } from '@/lib/recherche'

/**
 * Onglet Ordres de travail : OT du prestataire sur le site, en LECTURE SEULE.
 * Réutilise `OtCard` (clic → fiche OT), `ListPageBody` + le filtre statut de la
 * page OT (`matchStatutOt` / `statutOtFilterOptions`) et le tri par urgence.
 * Défaut « Non terminés » (un prestataire peut cumuler beaucoup d'historique).
 */
export function OtPanel({
  prestataireId,
  siteId,
  urlOf,
  refreshMiniatures,
}: { prestataireId: string; siteId: string } & MiniatureAccess) {
  const query = useQuery(
    prestatairesQueries.ordresTravail(prestataireId, siteId),
  )
  // Onglet OT en LIVE (clôture/changement de statut ailleurs visible sans F5).
  // Canal `ordres_travail` partagé/refcompté avec l'onglet Gammes → aucun surcoût.
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState<string>(FILTRE_NON_TERMINES)

  const q = normaliserRecherche(search)
  const filtered = trierOtParUrgence(
    (query.data ?? []).filter((ot) => {
      if (!matchStatutOt(ot.statut, statutFilter)) return false
      if (q === '') return true
      return [ot.nom_gamme, ot.nom_equipement].some((v) =>
        normaliserRecherche(v ?? '').includes(q),
      )
    }),
  )

  // Documents rattachés aux OT du site, en UNE requête groupée filtrée par site
  // (pas par liste d'ids — cf. `ordresTravailQueries.documentsParOt`).
  const documentsQuery = useQuery(ordresTravailQueries.documentsParOt(siteId))
  const documentsParOt =
    documentsQuery.data ?? new Map<string, DocumentMeta[]>()

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={4} />}
      empty={
        <EmptyState
          icon={ClipboardList}
          title="Aucun ordre de travail"
          description="Aucun OT pour ce prestataire sur le site actif."
          className={ONGLET_ETAT_VIDE}
        />
      }
    >
      {() => (
        <ListPageBody
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher un ordre de travail…"
          filterValue={statutFilter}
          onFilterChange={setStatutFilter}
          options={statutOtFilterOptions()}
          filterLabel="Filtrer par statut"
          sticky
          isEmpty={filtered.length === 0}
          emptySearchDescription="Aucun ordre de travail ne correspond à ces critères."
        >
          {filtered.map((ot) => (
            <OtCard
              key={ot.id}
              ot={ot}
              urlOf={urlOf}
              refreshMiniatures={refreshMiniatures}
              documents={documentsParOt.get(ot.id) ?? []}
            />
          ))}
        </ListPageBody>
      )}
    </QueryState>
  )
}
