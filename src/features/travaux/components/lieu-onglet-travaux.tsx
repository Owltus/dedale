import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { HardHat } from 'lucide-react'
import { travauxQueries, statutsTravauxQueries } from '../queries'
import { statutTravauxTone } from '../etat'
import { dateAffichee } from '../format'
import { TravauxFormDialog } from './travaux-form-dialog'
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
 * Onglet « Travaux » de la fiche d'un lieu : travaux dont le lieu principal
 * est ce lieu (ou un de ses équipements), ou qui y ont une tâche
 * (`travaux_du_lieu`). Défaut « Non terminés » ; ligne `FicheRow`, clic →
 * fiche du travaux. Le bouton + crée un travaux sur ce lieu (rôles métier) puis
 * ouvre sa fiche, comme la page Travaux. Injecté dans la fiche par la route.
 */
export function LieuOngletTravaux({ localId, siteId, total }: OngletLieuProps) {
  const navigate = useNavigate()
  const [filtre, setFiltre] = useState(FILTRE_NON_TERMINES)
  const query = useInfiniteQuery(
    travauxQueries.duLieu(
      total === 0 ? null : localId,
      filtre === FILTRE_NON_TERMINES,
    ),
  )
  useRealtimeRefresh('interventions_travaux', travauxQueries.all())
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const [formOpen, setFormOpen] = useState(false)
  useTabAddAction(canManage ? () => setFormOpen(true) : null, 'Nouveau travaux')

  // Lien `slug~id` : la fiche s'ouvre sans connaître tous les travaux du site.
  const ouvrir = (t: { id: string; titre: string }) =>
    void navigate({
      to: '/travaux/$travaux',
      params: { travaux: segAlias({ nom: t.titre, id: t.id }) },
    })

  return (
    <>
      <OngletPagine
        query={query}
        total={total}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={HardHat}
            title="Aucun travaux"
            description="Aucun travaux sur ce lieu ni ses équipements."
            className={ONGLET_ETAT_VIDE}
          />
        }
        filterValue={filtre}
        onFilterChange={setFiltre}
        options={statutFilterOptions([])}
        filterLabel="Filtrer par statut"
        searchPlaceholder="Rechercher un travaux…"
        texteRecherche={(t) => [t.titre, t.description, t.locaux?.nom]}
        emptySearchDescription="Aucun travaux ne correspond à ces critères."
        getKey={(t) => t.id}
        renderItem={(t) => {
          const lieuTexte = lieuPrincipalTexte(t)
          const texteHabituel = t.description?.trim()
            ? t.description
            : `Créé le ${formatDate(t.date_demande)}`
          return (
            <FicheRow
              icon={HardHat}
              tone={statutTravauxTone(t.statut_travaux_id)}
              titre={t.titre}
              sousTitre={
                lieuTexte ? `${lieuTexte} · ${texteHabituel}` : texteHabituel
              }
              statutLabel={statusLabelById(t.statut_travaux_id, statutNom)}
              date={dateAffichee(t)}
              documents={[]}
              onClick={() => ouvrir(t)}
            />
          )
        }}
      />
      {canManage && (
        <TravauxFormDialog
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
