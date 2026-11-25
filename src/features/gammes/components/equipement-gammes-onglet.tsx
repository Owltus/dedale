import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Wrench } from 'lucide-react'
import { gammesQueries } from '../queries'
import { listStack } from '@/lib/responsive'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'

/**
 * Onglet « Gammes » de la fiche équipement : les gammes du site liées à cet
 * équipement. Vit côté gammes (il en lit la liste) et est injecté dans
 * `EquipementDetail` par la route : equipements ne dépend pas de gammes.
 */
export function EquipementGammesOnglet({
  siteId,
  liesQuery,
}: {
  siteId: string
  liesQuery: UseQueryResult<string[]>
}) {
  const gammesQuery = useQuery(gammesQueries.list(siteId))

  const lies = useMemo(() => {
    const gammes = gammesQuery.data ?? []
    const liesIds = liesQuery.data ?? []
    return gammes.filter((g) => liesIds.includes(g.id))
  }, [gammesQuery.data, liesQuery.data])

  return (
    <QueryState query={liesQuery} pending={<ListRowSkeletons count={3} />}>
      {() =>
        lies.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Aucune gamme"
            className={ONGLET_ETAT_VIDE}
          />
        ) : (
          <div className={listStack}>
            {lies.map((g) => (
              <ListRow
                key={g.id}
                media={<RowMediaIcon icon={Wrench} />}
                title={g.nom}
                subtitle={
                  g.description?.trim() ? g.description.trim() : undefined
                }
              />
            ))}
          </div>
        )
      }
    </QueryState>
  )
}
