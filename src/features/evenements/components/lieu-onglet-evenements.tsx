import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { OctagonAlert } from 'lucide-react'
import { evenementsQueries, statutsEvenementsQueries } from '../queries'
import { statutEvenementTone } from '../etat'
import { dateAffichee } from '../format'
import { EvenementFormDialog } from './evenement-form-dialog'
import {
  FicheRow,
  lieuPrincipalTexte,
} from '@/features/taches/components/fiche-row'
import type { OngletLieuProps } from '@/features/localisations/fiche-lieu'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import * as perm from '@/lib/permissions'
import { formatDate } from '@/lib/date'
import { segAlias } from '@/lib/slug'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { OngletPagine } from '@/components/common/onglet-pagine'
import { statusLabelById } from '@/components/common/status-badge'
import { useTabAddAction } from '@/components/common/tab-actions'
import {
  FILTRE_NON_TERMINES,
  statutFilterOptions,
} from '@/components/common/list-filter-bar'

/**
 * Onglet « Événements » de la fiche d'un lieu : événements dont le lieu
 * principal est ce lieu (ou un de ses équipements), ou qui y ont une tâche
 * (`evenements_du_lieu`). Défaut « Non terminés » ; ligne `FicheRow`, clic →
 * fiche de l'événement. Le bouton + consigne un événement sur ce lieu (rôles
 * métier) puis ouvre sa fiche. Injecté dans la fiche par la route.
 */
export function LieuOngletEvenements({
  localId,
  siteId,
  total,
}: OngletLieuProps) {
  const navigate = useNavigate()
  const [filtre, setFiltre] = useState(FILTRE_NON_TERMINES)
  const query = useInfiniteQuery(
    evenementsQueries.duLieu(
      total === 0 ? null : localId,
      filtre === FILTRE_NON_TERMINES,
    ),
  )
  useRealtimeRefresh('evenements', evenementsQueries.all())
  const { data: statuts = [] } = useQuery(statutsEvenementsQueries.list())
  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const [formOpen, setFormOpen] = useState(false)
  useTabAddAction(
    canManage ? () => setFormOpen(true) : null,
    'Consigner un événement',
  )

  // Lien `slug~id` : la fiche s'ouvre sans connaître tous les événements du site.
  const ouvrir = (ev: { id: string; titre: string }) =>
    void navigate({
      to: '/evenements/$evenement',
      params: { evenement: segAlias({ nom: ev.titre, id: ev.id }) },
    })

  return (
    <>
      <OngletPagine
        query={query}
        total={total}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={OctagonAlert}
            title="Aucun événement"
            description="Aucun événement consigné sur ce lieu ni ses équipements."
            className={ONGLET_ETAT_VIDE}
          />
        }
        filterValue={filtre}
        onFilterChange={setFiltre}
        options={statutFilterOptions([])}
        filterLabel="Filtrer par statut"
        searchPlaceholder="Rechercher un événement…"
        texteRecherche={(ev) => [ev.titre, ev.description, ev.locaux?.nom]}
        emptySearchDescription="Aucun événement ne correspond à ces critères."
        getKey={(ev) => ev.id}
        renderItem={(ev) => {
          const lieuTexte = lieuPrincipalTexte(ev)
          const texteHabituel = ev.description?.trim()
            ? ev.description
            : `Survenu le ${formatDate(ev.date_evenement)}`
          return (
            <FicheRow
              icon={OctagonAlert}
              tone={statutEvenementTone(ev.statut_evenement_id)}
              titre={ev.titre}
              sousTitre={
                lieuTexte ? `${lieuTexte} · ${texteHabituel}` : texteHabituel
              }
              statutLabel={statusLabelById(ev.statut_evenement_id, statutNom)}
              date={dateAffichee(ev)}
              documents={[]}
              onClick={() => ouvrir(ev)}
            />
          )
        }}
      />
      {canManage && (
        <EvenementFormDialog
          key={formOpen ? 'open' : 'closed'}
          open={formOpen}
          onOpenChange={setFormOpen}
          siteId={siteId}
          localIdParDefaut={localId}
          onCreated={ouvrir}
        />
      )}
    </>
  )
}
