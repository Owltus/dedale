import { useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
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

/** Hauteur d'une `ListRow` média densité `xs` (`h-11`), pour le fit-to-height. */
const HAUTEUR_LIGNE = 44

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
      // Marges internes réduites (24 → 12 px) : padding vertical `py-3` (via className,
      // surcharge le `py-6` de la carte) + horizontal `px-3` (via contentClassName).
      className="py-3 md:min-h-0 md:flex-1"
      contentClassName="flex min-h-0 flex-col px-3"
    >
      <div
        ref={zoneRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <QueryState
          query={demandesQuery}
          pending={<ListRowSkeletons count={4} dense />}
          errorClassName="py-6"
          empty={
            // `flex-1` → l'état vide occupe toute la hauteur de la carte ; son
            // `justify-center` interne le centre alors verticalement (et horizontalement).
            <EmptyState
              icon={ClipboardList}
              title="Aucune demande"
              description="Aucun signalement pour ce site."
              className="flex-1"
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
                    size="xs"
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
