import { useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, MessageSquareWarning } from 'lucide-react'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { StatusBadge } from '@/components/common/status-badge'
import { diTitre } from '@/features/demandes/schemas'
import { statutLabel, statutTone } from '@/features/demandes/etat'
import { formatDate } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { segOfUnique } from '@/lib/slug'
import { DashboardCard } from './dashboard-card'
import { useDashboardData } from '../use-dashboard-data'
import { useLignesVisibles } from '../use-lignes-visibles'

interface DernieresDemandesProps {
  siteId: string
}

/** Hauteur d'une `ListRow` média densité `sm` (`h-14`), pour le fit-to-height. */
const HAUTEUR_LIGNE = 56

/**
 * Colonne « Demandes d'intervention » du tableau de bord (zone 3, gauche).
 * Les DI OUVERTES (`statut_di_id !== 3`) sont affichées EN TÊTE, puis les
 * RÉSOLUES (`=== 3`) ; l'ordre récence intra-groupe (date_constat DESC, created_at
 * DESC) est déjà fourni par `demandesQueries.list` et préservé par le filtrage
 * stable. Clic → fiche de la demande (slug `segOfUnique`, jamais l'UUID).
 *
 * Fit-to-height : la zone de liste (flex-1, `overflow-hidden`) est mesurée par
 * `useLignesVisibles` → on ne rend que le nombre de lignes qui tiennent, sans
 * scrollbar.
 */
export function DernieresDemandes({ siteId }: DernieresDemandesProps) {
  const { demandesQuery } = useDashboardData(siteId)
  const navigate = useNavigate()
  const zoneRef = useRef<HTMLDivElement>(null)
  const nbLignes = useLignesVisibles(zoneRef, HAUTEUR_LIGNE)

  return (
    <DashboardCard
      icon={MessageSquareWarning}
      title="Demandes d'intervention"
      contentClassName="flex min-h-0 flex-col"
    >
      <div ref={zoneRef} className="min-h-0 flex-1 overflow-hidden">
        <QueryState
          query={demandesQuery}
          pending={<ListRowSkeletons count={4} dense />}
          errorClassName="py-6"
          empty={
            <EmptyState
              icon={ClipboardList}
              title="Aucune demande"
              description="Aucun signalement pour ce site."
              className="py-6"
            />
          }
        >
          {(demandes) => {
            // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
            // fiche détail (symétrie `segOfUnique`), sur la liste complète.
            const sibs = demandes.map((d) => ({
              nom: diTitre(d.constat),
              id: d.id,
            }))
            const ouvertes = demandes.filter((d) => d.statut_di_id !== 3)
            const resolues = demandes.filter((d) => d.statut_di_id === 3)
            const ordonnees = [...ouvertes, ...resolues].slice(0, nbLignes)
            return (
              <div className={listStack}>
                {ordonnees.map((d) => (
                  <ListRow
                    key={d.id}
                    size="sm"
                    tone={statutTone(d.statut_di_id)}
                    media={<RowMediaIcon icon={ClipboardList} />}
                    title={diTitre(d.constat)}
                    subtitle={formatDate(d.date_constat)}
                    badges={
                      <StatusBadge tone={statutTone(d.statut_di_id)}>
                        {statutLabel(d.statut_di_id)}
                      </StatusBadge>
                    }
                    mobileBadge={
                      <StatusBadge tone={statutTone(d.statut_di_id)}>
                        {statutLabel(d.statut_di_id)}
                      </StatusBadge>
                    }
                    onClick={() =>
                      void navigate({
                        to: '/demandes/$demande',
                        params: {
                          demande: segOfUnique(
                            { nom: diTitre(d.constat), id: d.id },
                            sibs,
                          ),
                        },
                      })
                    }
                  />
                ))}
              </div>
            )
          }}
        </QueryState>
      </div>
    </DashboardCard>
  )
}
