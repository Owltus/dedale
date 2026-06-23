import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import {
  LIBELLES_STATUT_OT,
  variantStatutOt,
} from '@/features/ordres-travail/schemas'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { formatDate } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { Badge } from '@/components/ui/badge'

/**
 * Liste (lecture) des ordres de travail rattachés à une ou plusieurs gammes,
 * TOUS statuts confondus, triés par date prévue décroissante. Un clic redirige
 * vers la page Ordres de travail, ouverte directement sur l'OT ciblé
 * (`?ot=<id>`). Réutilisée par le Plan de maintenance (panneau OT du palier
 * sous-catégorie) et par la fiche gamme (onglet « Ordres de travail »).
 */
export function OtListeParGammes({
  siteId,
  gammeIds,
  emptyDescription = "Aucun OT n'est rattaché à cette gamme.",
}: {
  siteId: string
  gammeIds: string[]
  /** Texte de l'état vide (selon le contexte : une gamme ou une sous-catégorie). */
  emptyDescription?: string
}) {
  const navigate = useNavigate()
  const query = useQuery(ordresTravailQueries.byGammes(siteId, gammeIds))
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={
        <EmptyState
          icon={ClipboardList}
          title="Aucun ordre de travail"
          description={emptyDescription}
        />
      }
    >
      {(ordres) => (
        <div className={listStack}>
          {ordres.map((ot) => (
            <ListRow
              key={ot.id}
              media={<RowMediaIcon icon={ClipboardList} />}
              title={ot.nom_gamme}
              subtitle={ot.nom_equipement ?? ot.nom_prestataire}
              badges={
                <Badge variant={variantStatutOt(ot.statut)}>
                  {LIBELLES_STATUT_OT[ot.statut] ?? ot.statut}
                </Badge>
              }
              meta={formatDate(ot.date_prevue)}
              // Variante média : sous `sm`, mobileMeta REMPLACE le sous-titre →
              // on y remet l'équipement (seul discriminant entre OT d'une même
              // gamme), avec statut + date prévue.
              mobileMeta={[
                ot.nom_equipement ?? ot.nom_prestataire,
                LIBELLES_STATUT_OT[ot.statut] ?? ot.statut,
                formatDate(ot.date_prevue),
              ]
                .filter(Boolean)
                .join(' · ')}
              onClick={() =>
                void navigate({ to: '/ordres-travail', search: { ot: ot.id } })
              }
            />
          ))}
        </div>
      )}
    </QueryState>
  )
}
