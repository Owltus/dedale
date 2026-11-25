import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { demandesQueries } from '../queries'
import { DemandeRow } from './demande-row'
import { DiFormDialog } from './di-form-dialog'
import type { OngletLieuProps } from '@/features/localisations/fiche-lieu'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import * as perm from '@/lib/permissions'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { OngletPagine } from '@/components/common/onglet-pagine'
import { useTabAddAction } from '@/components/common/tab-actions'
import {
  FILTRE_NON_TERMINES,
  statutFilterOptions,
} from '@/components/common/list-filter-bar'

/**
 * Onglet « Demandes » de la fiche d'un lieu : DI posées sur le lieu ou sur un
 * de ses équipements (`di_du_lieu`). Défaut « Non terminés ». Le bouton + de
 * l'en-tête ouvre une nouvelle demande avec ce lieu pré-rempli (tout rôle
 * sauf le lecteur, la RLS arbitre). Injecté dans la fiche par la route.
 */
export function LieuOngletDemandes({
  localId,
  siteId,
  total,
}: OngletLieuProps) {
  const [filtre, setFiltre] = useState(FILTRE_NON_TERMINES)
  const query = useInfiniteQuery(
    demandesQueries.duLieu(
      total === 0 ? null : localId,
      filtre === FILTRE_NON_TERMINES,
    ),
  )
  useRealtimeRefresh('demandes_intervention', demandesQueries.all())
  const { data: role } = useCurrentRole()
  const canCreate = perm.canCreateDemande(role)
  const [formOpen, setFormOpen] = useState(false)
  useTabAddAction(
    canCreate ? () => setFormOpen(true) : null,
    "Nouvelle demande d'intervention",
  )

  return (
    <>
      <OngletPagine
        query={query}
        total={total}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="Aucune demande"
            description="Aucune demande d’intervention pour ce lieu ni ses équipements."
            className={ONGLET_ETAT_VIDE}
          />
        }
        filterValue={filtre}
        onFilterChange={setFiltre}
        options={statutFilterOptions([])}
        filterLabel="Filtrer par statut"
        searchPlaceholder="Rechercher une demande…"
        texteRecherche={(d) => [d.constat, d.lieu]}
        emptySearchDescription="Aucune demande ne correspond à ces critères."
        getKey={(d) => d.id}
        renderItem={(d) => <DemandeRow demande={d} lieu={d.lieu} />}
      />
      {canCreate && (
        <DiFormDialog
          key={formOpen ? 'open' : 'closed'}
          open={formOpen}
          onOpenChange={setFormOpen}
          siteId={siteId}
          localIdParDefaut={localId}
        />
      )}
    </>
  )
}
