import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HardHat, Plus } from 'lucide-react'
import {
  travauxQueries,
  statutsTravauxQueries,
} from '@/features/travaux/queries'
import { useDeleteTravaux } from '@/features/travaux/mutations'
import {
  statutTravauxTone,
  STATUTS_TRAVAUX_TERMINAUX,
} from '@/features/travaux/etat'
import { estVerrouille } from '@/features/travaux/schemas'
import { dateAffichee } from '@/features/travaux/format'
import { TravauxFormDialog } from '@/features/travaux/components/travaux-form-dialog'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/travaux/page-meta'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { actionsEditionSuppression } from '@/components/common/row-actions'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  matchStatutFilter,
  statutFilterOptions,
  FILTRE_TOUS,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge, statusLabelById } from '@/components/common/status-badge'
import type { Database } from '@/lib/database.types'

type Travaux = Database['public']['Tables']['interventions_travaux']['Row']

export const Route = createFileRoute('/_app/travaux/')({
  component: TravauxPage,
})

function TravauxPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Travaux = écran MÉTIER (cf. RLS) : manager/technicien créent/éditent
        // ET SUPPRIMENT sur leurs sites (migration 053), lecteur consulte.
        <TravauxContent
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
  )
}

function TravauxContent({
  siteId,
  canManage,
  canDelete,
}: {
  siteId: string
  canManage: boolean
  canDelete: boolean
}) {
  const navigate = useNavigate()
  const query = useQuery(travauxQueries.list(siteId))
  // Liste en LIVE (nouveau chantier/travaux visible sans F5).
  useRealtimeRefresh('interventions_travaux', travauxQueries.all())
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const del = useDeleteTravaux()
  const dialog = useEntityDialog<Travaux>()
  const suppression = useConfirmDelete<Travaux>({
    onDelete: (t) => del.mutateAsync(t.id),
    successMessage: 'Travaux supprimé',
  })
  const [recherche, setRecherche] = useState('')
  // Défaut « TOUS les statuts » (décision PO) : la liste sert autant à consulter
  // l'historique des travaux réalisés qu'à suivre ceux en cours. Masquer les
  // terminés cachait la moitié de l'information au premier coup d'œil. Le filtre
  // reste là pour isoler les travaux actifs.
  const [statutFilter, setStatutFilter] = useState(FILTRE_TOUS)

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const statutOptions = statutFilterOptions(
    [...statuts].sort((a, b) => a.id - b.id),
  )

  // Après création : rediriger vers la fiche (où l'on ajoute les tâches). On
  // calcule le slug avec les frères ACTUELS + le nouveau (symétrie segOfUnique).
  function handleCreated(created: Travaux) {
    const sibs = [...(query.data ?? []), created].map((c) => ({
      nom: c.titre,
      id: c.id,
    }))
    void navigate({
      to: '/travaux/$travaux',
      params: {
        travaux: segOfUnique({ nom: created.titre, id: created.id }, sibs),
      },
    })
  }

  const newButton = canManage ? (
    <Button onClick={dialog.openCreate}>
      <Plus /> Nouveau travaux
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title={PAGE_META.titre}
        description={PAGE_META.description}
        action={
          canManage ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Nouveau travaux"
              variant="outline"
              onClick={dialog.openCreate}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons />}
        empty={
          <EmptyState
            icon={HardHat}
            title="Aucun travaux"
            description={
              canManage
                ? 'Crée un premier travaux pour suivre des travaux ponctuels.'
                : 'Aucun travaux enregistré pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {(travaux) => {
          const q = recherche.trim().toLowerCase()
          const shown = travaux.filter((c) => {
            if (
              !matchStatutFilter(
                c.statut_travaux_id,
                statutFilter,
                STATUTS_TRAVAUX_TERMINAUX,
              )
            )
              return false
            if (q === '') return true
            return (
              c.titre.toLowerCase().includes(q) ||
              (c.description ?? '').toLowerCase().includes(q)
            )
          })
          // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
          // fiche détail (symétrie segOfUnique), sur la liste NON filtrée.
          const sibs = travaux.map((c) => ({ nom: c.titre, id: c.id }))
          return (
            <ListPageBody
              search={recherche}
              onSearchChange={setRecherche}
              searchPlaceholder="Rechercher un travaux…"
              filterValue={statutFilter}
              onFilterChange={setStatutFilter}
              options={statutOptions}
              filterLabel="Filtrer par statut"
              isEmpty={shown.length === 0}
              emptySearchDescription="Aucun travaux ne correspond à ces critères."
            >
              {shown.map((c) => {
                // Libellé TOUJOURS défini (repli « Statut inconnu ») : le
                // référentiel arrive après la liste, et un badge conditionnel
                // apparaissait donc au second rendu — la ligne bougeait.
                const statutLabel = statusLabelById(
                  c.statut_travaux_id,
                  statutNom,
                )
                const editable =
                  canManage && !estVerrouille(c.statut_travaux_id)
                const rowActions = actionsEditionSuppression({
                  onModifier: editable ? () => dialog.openEdit(c) : undefined,
                  onSupprimer: canDelete
                    ? () => suppression.demander(c)
                    : undefined,
                })
                return (
                  <ListRow
                    key={c.id}
                    tone={statutTravauxTone(c.statut_travaux_id)}
                    media={<RowMediaIcon icon={HardHat} />}
                    title={c.titre}
                    subtitle={
                      c.description?.trim()
                        ? c.description
                        : `Créé le ${formatDate(c.date_demande)}`
                    }
                    onClick={() =>
                      void navigate({
                        to: '/travaux/$travaux',
                        params: {
                          travaux: segOfUnique(
                            { nom: c.titre, id: c.id },
                            sibs,
                          ),
                        },
                      })
                    }
                    // UN SEUL bloc à droite, empilé dans une colonne de largeur
                    // fixe : statut au-dessus, date en dessous. `badges` et
                    // `meta` étaient deux blocs CÔTE À CÔTE, et la largeur du
                    // second suivait celle des dates — un travaux terminé, qui
                    // en affichait deux, poussait son badge plus à gauche que
                    // les autres. Empilés, les deux colonnes s'alignent par
                    // construction (patron Événements / Investissements).
                    meta={
                      <div className="flex w-32 flex-col items-end gap-1">
                        <StatusBadge
                          tone={statutTravauxTone(c.statut_travaux_id)}
                        >
                          {statutLabel}
                        </StatusBadge>
                        {/* La date SUIT le statut affiché au-dessus : terminé →
                            date de fin, sinon date de création. */}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatDate(dateAffichee(c))}
                        </span>
                      </div>
                    }
                    mobileMeta={`${statutLabel} · ${formatDate(dateAffichee(c))}`}
                    menuActions={rowActions.length ? rowActions : undefined}
                  />
                )
              })}
            </ListPageBody>
          )
        }}
      </QueryState>

      {canManage && (
        <TravauxFormDialog
          key={dialog.dialogKey}
          open={dialog.open}
          onOpenChange={dialog.onOpenChange}
          siteId={siteId}
          travaux={dialog.entity}
          onCreated={handleCreated}
        />
      )}

      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={
          suppression.toDelete
            ? `le travaux « ${suppression.toDelete.titre} »`
            : 'le travaux'
        }
        warning="Cette suppression est définitive. Le travaux et ses liaisons (locaux, équipements) sont retirés ; les documents rattachés restent dans la bibliothèque du site."
      />
    </PageContainer>
  )
}
