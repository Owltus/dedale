import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { StatusBadge } from '@/components/common/status-badge'
import { diTitre } from '@/features/demandes/schemas'
import { statutLabel, statutTone } from '@/features/demandes/etat'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { DashboardListCard } from './dashboard-list-card'
import { useDashboardData } from '../use-dashboard-data'

interface DernieresDemandesProps {
  siteId: string
}

/**
 * Colonne « Demandes d'intervention » du tableau de bord (zone 3, gauche).
 * Les DI OUVERTES (`statut_di_id !== 3`) sont affichées EN TÊTE, puis les
 * RÉSOLUES (`=== 3`) ; l'ordre récence intra-groupe (date_constat DESC, created_at
 * DESC) est déjà fourni par `demandesQueries.list` et préservé par le filtrage
 * stable. Clic → fiche de la demande (slug `segOfUnique`, jamais l'UUID).
 *
 * Enveloppe (fit-to-height, carte, état vide centré) : `DashboardListCard`.
 */
export function DernieresDemandes({ siteId }: DernieresDemandesProps) {
  const { demandesQuery } = useDashboardData(siteId)
  const navigate = useNavigate()

  return (
    <DashboardListCard
      query={demandesQuery}
      emptyIcon={ClipboardList}
      emptyTitle="Aucune demande"
      emptyDescription="Aucun signalement pour ce site."
    >
      {(demandes, nbLignes) => {
        // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la fiche
        // détail (symétrie `segOfUnique`), sur la liste complète.
        const sibs = demandes.map((d) => ({
          nom: diTitre(d.constat),
          id: d.id,
        }))
        const ouvertes = demandes.filter((d) => d.statut_di_id !== 3)
        const resolues = demandes.filter((d) => d.statut_di_id === 3)
        const ordonnees = [...ouvertes, ...resolues].slice(0, nbLignes)
        return ordonnees.map((d) => (
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
        ))
      }}
    </DashboardListCard>
  )
}
