import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { ordresTravailQueries } from '../queries'
import { OtCard } from './ot-card'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import type { OngletLieuProps } from '@/features/localisations/fiche-lieu'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { OngletPagine } from '@/components/common/onglet-pagine'
import {
  FILTRE_NON_TERMINES,
  statutFilterOptions,
} from '@/components/common/list-filter-bar'

/**
 * Onglet « Ordres de travail » de la fiche d'un lieu, en lecture : les OT des
 * gammes liées à ses équipements et ceux qui ont une opération exécutée sur
 * l'un d'eux (`ot_du_lieu`). Défaut « Non terminés » ; carte `OtCard`
 * (clic → fiche OT). Injecté dans la fiche par la route.
 */
export function LieuOngletOt({ localId, total }: OngletLieuProps) {
  const [filtre, setFiltre] = useState(FILTRE_NON_TERMINES)
  const query = useInfiniteQuery(
    ordresTravailQueries.duLieu(
      total === 0 ? null : localId,
      filtre === FILTRE_NON_TERMINES,
    ),
  )
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  return (
    <OngletPagine
      query={query}
      total={total}
      pending={<ListRowSkeletons count={4} />}
      empty={
        <EmptyState
          icon={ClipboardList}
          title="Aucun ordre de travail"
          description="Aucun ordre de travail ne concerne les équipements de ce lieu."
          className={ONGLET_ETAT_VIDE}
        />
      }
      filterValue={filtre}
      onFilterChange={setFiltre}
      options={statutFilterOptions([])}
      filterLabel="Filtrer par statut"
      searchPlaceholder="Rechercher un ordre de travail…"
      texteRecherche={(ot) => [ot.nom_gamme, ot.nom_equipement]}
      emptySearchDescription="Aucun ordre de travail ne correspond à ces critères."
      getKey={(ot) => ot.id}
      renderItem={(ot) => (
        <OtCard ot={ot} urlOf={urlOf} refreshMiniatures={refreshMiniatures} />
      )}
    />
  )
}
