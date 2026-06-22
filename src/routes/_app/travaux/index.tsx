import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HardHat, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { TravauxFormDialog } from '@/features/travaux/components/travaux-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import { formatDate } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import type { RowAction } from '@/components/common/row-actions'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  ListFilterBar,
  matchStatutFilter,
  statutFilterOptions,
  FILTRE_NON_TERMINES,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/status-badge'
import type { Database } from '@/lib/database.types'

type Travaux = Database['public']['Tables']['interventions_travaux']['Row']

export const Route = createFileRoute('/_app/travaux/')({
  component: TravauxPage,
})

function TravauxPage() {
  const { data: role } = useCurrentRole()
  // Travaux = écran MÉTIER (cf. RLS) : manager/technicien créent/éditent ET
  // SUPPRIMENT sur leurs sites (migration 053), lecteur consulte.
  const canManage = perm.canManageMetier(role)
  const canDelete = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Travaux"
        description="Travaux ponctuels du site."
        hint="Choisis un site pour voir ses travaux."
        icon={HardHat}
      />
    )
  }

  return (
    <TravauxContent
      siteId={activeSiteId}
      canManage={canManage}
      canDelete={canDelete}
    />
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
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const del = useDeleteTravaux()
  const [form, setForm] = useState<{ open: boolean; travaux: Travaux | null }>({
    open: false,
    travaux: null,
  })
  const [toDelete, setToDelete] = useState<Travaux | null>(null)
  const [recherche, setRecherche] = useState('')
  // Défaut : on masque les travaux terminés (Terminé/Annulé) — le filtre permet
  // d'afficher un statut précis ou « Tous les statuts ».
  const [statutFilter, setStatutFilter] = useState(FILTRE_NON_TERMINES)

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const statutOptions = statutFilterOptions(
    [...statuts].sort((a, b) => a.id - b.id),
  )

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Travaux supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

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
    <Button onClick={() => setForm({ open: true, travaux: null })}>
      <Plus /> Nouveau travaux
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Travaux"
        description="Travaux ponctuels du site."
        action={
          canManage ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Nouveau travaux"
              variant="outline"
              onClick={() => setForm({ open: true, travaux: null })}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons count={4} />}
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
            <div className="flex flex-col gap-4">
              <ListFilterBar
                search={recherche}
                onSearchChange={setRecherche}
                searchPlaceholder="Rechercher un travaux…"
                filterValue={statutFilter}
                onFilterChange={setStatutFilter}
                options={statutOptions}
                filterLabel="Filtrer par statut"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucun travaux ne correspond à ces critères." />
              ) : (
                <div className={listStack}>
                  {shown.map((c) => {
                    const statutLabel = statutNom.get(c.statut_travaux_id)
                    const editable =
                      canManage && !estVerrouille(c.statut_travaux_id)
                    const rowActions: RowAction[] = []
                    if (editable)
                      rowActions.push({
                        label: 'Modifier',
                        icon: Pencil,
                        onSelect: () => setForm({ open: true, travaux: c }),
                      })
                    if (canDelete)
                      rowActions.push({
                        label: 'Supprimer',
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => setToDelete(c),
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
                        badges={
                          statutLabel ? (
                            <StatusBadge
                              tone={statutTravauxTone(c.statut_travaux_id)}
                            >
                              {statutLabel}
                            </StatusBadge>
                          ) : undefined
                        }
                        meta={
                          <div className="text-right leading-tight tabular-nums">
                            <div className="text-xs">
                              Créé le {formatDate(c.date_demande)}
                            </div>
                            {c.date_fin && (
                              <div className="text-xs">
                                Terminé le {formatDate(c.date_fin)}
                              </div>
                            )}
                          </div>
                        }
                        mobileMeta={statutLabel}
                        menuActions={
                          rowActions.length ? rowActions : undefined
                        }
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        }}
      </QueryState>

      {canManage && (
        <TravauxFormDialog
          key={form.travaux?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          travaux={form.travaux}
          onCreated={handleCreated}
        />
      )}

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete ? `le travaux « ${toDelete.titre} »` : 'le travaux'
        }
        warning="Cette suppression est définitive. Le travaux et ses liaisons (locaux, équipements) sont retirés ; les documents rattachés restent dans la bibliothèque du site."
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
