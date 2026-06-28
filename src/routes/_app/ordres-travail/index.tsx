import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { useDeleteOt } from '@/features/ordres-travail/mutations'
import {
  matchStatutOt,
  statutOtFilterOptions,
} from '@/features/ordres-travail/schemas'
import { OtCard } from '@/features/ordres-travail/components/ot-card'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import { calculerRelevesParOt } from '@/features/ordres-travail/releves'
import { OtCreateDialog } from '@/features/ordres-travail/components/ot-create-dialog'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import type { RowAction } from '@/components/common/row-actions'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import {
  FILTRE_TOUS,
  ListFilterBar,
} from '@/components/common/list-filter-bar'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/ordres-travail/')({
  component: OrdresTravailPage,
})

function OrdresTravailPage() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Ordres de travail"
        description="Exécution de la maintenance préventive et réglementaire."
        hint="Choisis un site pour voir ses ordres de travail."
        icon={ClipboardList}
      />
    )
  }

  return <OrdresTravailContent siteId={activeSiteId} canManage={canManage} />
}

function OrdresTravailContent({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const { session } = useAuth()
  const query = useQuery(ordresTravailQueries.list(siteId))
  // Relevés (consommations) des compteurs cumulatifs du site, en UNE requête
  // groupée → map `ot_id → « 80 kWh »` (même règle que la fiche détail).
  const relevesQuery = useQuery(ordresTravailQueries.relevesListe(siteId))
  const releveParOt = useMemo(
    () => calculerRelevesParOt(relevesQuery.data ?? []),
    [relevesQuery.data],
  )
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const del = useDeleteOt()

  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState<{ id: string; nom: string } | null>(
    null,
  )
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState<string>(FILTRE_TOUS)

  // Filtre (recherche + statut) puis tri par urgence — mémoïsé pour ne PAS
  // refiltrer/retrier tous les OT du site à chaque ouverture de dialog ; seul un
  // changement de données / recherche / filtre le recalcule.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trierOtParUrgence(
      (query.data ?? []).filter((ot) => {
        if (!matchStatutOt(ot.statut, statutFilter)) return false
        if (q === '') return true
        return [ot.nom_gamme, ot.nom_equipement, ot.nom_prestataire].some((v) =>
          v?.toLowerCase().includes(q),
        )
      }),
    )
  }, [query.data, search, statutFilter])

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('OT supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const canCreate = canManage && Boolean(session)
  // Barre de titre : bouton icône + tooltip (convention PageHeader, pages sœurs).
  const headerAction = canCreate ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvel OT"
      variant="outline"
      onClick={() => setCreateOpen(true)}
    />
  ) : undefined
  // État vide : bouton plein libellé (appel à l'action principal).
  const newButton = canCreate ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus /> Nouvel OT
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Ordres de travail"
        description="Exécution de la maintenance préventive et réglementaire du site."
        action={headerAction}
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons count={5} />}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="Aucun ordre de travail"
            description={
              canManage
                ? 'Génère un OT depuis une gamme pour démarrer l’exécution.'
                : 'Aucun OT enregistré pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {() => {
          return (
            <div className="flex flex-col gap-4">
              <ListFilterBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Rechercher un ordre de travail…"
                filterValue={statutFilter}
                onFilterChange={setStatutFilter}
                options={statutOtFilterOptions()}
                filterLabel="Filtrer par statut"
              />
              {filtered.length === 0 ? (
                <NoSearchResults description="Aucun ordre de travail ne correspond à ces critères." />
              ) : (
                <div className={listStack}>
                  {filtered.map((ot) => {
                    const actions: RowAction[] = canManage
                      ? [
                          {
                            label: 'Supprimer',
                            icon: Trash2,
                            destructive: true,
                            onSelect: () =>
                              setToDelete({ id: ot.id, nom: ot.nom_gamme }),
                          },
                        ]
                      : []
                    return (
                      <OtCard
                        key={ot.id}
                        ot={ot}
                        urlOf={urlOf}
                        refreshMiniatures={refreshMiniatures}
                        menuActions={actions.length ? actions : undefined}
                        releve={releveParOt.get(ot.id) ?? null}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        }}
      </QueryState>

      {canManage && session && (
        <OtCreateDialog
          key={createOpen ? 'open' : 'closed'}
          open={createOpen}
          onOpenChange={setCreateOpen}
          siteId={siteId}
          createdBy={session.user.id}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer l'ordre de travail ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera supprimé définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
