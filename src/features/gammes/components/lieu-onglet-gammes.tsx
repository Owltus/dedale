import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
import { gammesQueries } from '../queries'
import { GammeCard } from './gamme-card'
import type { OtTriable } from '@/features/ordres-travail/tri'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import type { OngletLieuProps } from '@/features/localisations/fiche-lieu'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { OngletPagine } from '@/components/common/onglet-pagine'
import {
  FILTRE_NON_TERMINES,
  FILTRE_TOUS,
} from '@/components/common/list-filter-bar'

/** Filtre de l'onglet : actives (défaut) ou toutes. */
const OPTIONS_GAMMES = [
  { value: FILTRE_NON_TERMINES, label: 'Actifs' },
  { value: FILTRE_TOUS, label: 'Tous' },
]

/**
 * Onglet « Plans de maintenance » de la fiche d'un lieu, en lecture : gammes
 * du site liées aux équipements du lieu (`gammes_du_lieu`). Défaut « Actifs ».
 * Carte `GammeCard` en variante Plan de maintenance (statut des OT de la
 * gamme) ; clic → la gamme dans le Plan de maintenance (`?open=`). Injecté
 * dans la fiche par la route.
 */
export function LieuOngletGammes({ localId, siteId, total }: OngletLieuProps) {
  const navigate = useNavigate()
  const [filtre, setFiltre] = useState(FILTRE_NON_TERMINES)
  const query = useInfiniteQuery(
    gammesQueries.duLieu(
      total === 0 ? null : localId,
      filtre === FILTRE_NON_TERMINES,
    ),
  )
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // OT des gammes CHARGÉES (pas du site) → badge de statut de chaque carte.
  const gammeIds = (query.data?.pages ?? []).flat().map((g) => g.id)
  const otsQuery = useQuery(ordresTravailQueries.byGammes(siteId, gammeIds))
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())
  const otsIndispo = otsQuery.isLoading || otsQuery.isError
  const otsParGamme = new Map<string, OtTriable[]>()
  for (const ot of otsQuery.data ?? []) {
    if (ot.gamme_id === null) continue
    otsParGamme.set(ot.gamme_id, [...(otsParGamme.get(ot.gamme_id) ?? []), ot])
  }

  return (
    <OngletPagine
      query={query}
      total={total}
      pending={<ListRowSkeletons count={3} />}
      empty={
        <EmptyState
          icon={Wrench}
          title="Aucun plan de maintenance"
          description="Aucun plan de maintenance n’est lié aux équipements de ce lieu."
          className={ONGLET_ETAT_VIDE}
        />
      }
      filterValue={filtre}
      onFilterChange={setFiltre}
      options={OPTIONS_GAMMES}
      filterLabel="Filtrer par état"
      searchPlaceholder="Rechercher un plan de maintenance…"
      texteRecherche={(g) => [g.nom, g.description, g.prestataires?.libelle]}
      emptySearchDescription="Aucun plan de maintenance ne correspond à ces critères."
      getKey={(g) => g.id}
      renderItem={(g) => (
        <GammeCard
          gamme={g}
          urlOf={urlOf}
          refreshMiniatures={refreshMiniatures}
          statutOts={otsParGamme.get(g.id) ?? []}
          statutPending={otsIndispo}
          onClick={() =>
            void navigate({
              to: '/gammes/$',
              params: { _splat: '' },
              search: { open: g.id },
            })
          }
        />
      )}
    />
  )
}
