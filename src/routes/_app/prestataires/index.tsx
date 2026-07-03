import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Truck } from 'lucide-react'
import {
  contratsQueries,
  prestatairesQueries,
} from '@/features/prestataires/queries'
import { useDeletePrestataire } from '@/features/prestataires/mutations'
import { PrestataireFormDialog } from '@/features/prestataires/components/prestataire-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useSiteContext } from '@/lib/site-context'
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
import { actionsEditionSuppression } from '@/components/common/row-actions'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ListFilterBar } from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type Prestataire = Database['public']['Tables']['prestataires']['Row']

export const Route = createFileRoute('/_app/prestataires/')({
  component: PrestatairesIndexPage,
})

function PrestatairesIndexPage() {
  const { data: role } = useCurrentRole()
  // Gérés par manager + technicien sur leurs sites (migration 053) ; le garde
  // `!est_interne` + le trigger protègent le prestataire interne.
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Prestataires"
        description="Prestataires et contrats par site."
        hint="Choisis un site pour voir ses prestataires et contrats."
        icon={Truck}
      />
    )
  }

  return <PrestatairesList siteId={activeSiteId} canManage={canManage} />
}

function PrestatairesList({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const query = useQuery(prestatairesQueries.list())
  const { data: counts } = useQuery(contratsQueries.countsBySite(siteId))
  const del = useDeletePrestataire()
  const [search, setSearch] = useState('')
  const dialog = useEntityDialog<Prestataire>()
  const suppression = useConfirmDelete<Prestataire>({
    onDelete: (p) => del.mutateAsync(p.id),
    successMessage: 'Prestataire supprimé',
  })

  const nbContratsToDelete =
    suppression.toDelete !== null
      ? (counts?.get(suppression.toDelete.id) ?? 0)
      : 0

  const newButton = canManage ? (
    <Button onClick={dialog.openCreate}>
      <Plus /> Nouveau prestataire
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Prestataires"
        description="Prestataires (externes et régie interne) et leurs contrats."
        action={
          canManage ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Nouveau prestataire"
              variant="outline"
              onClick={dialog.openCreate}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Truck}
            title="Aucun prestataire"
            description={
              canManage
                ? 'Crée ton premier prestataire pour commencer.'
                : 'Aucun prestataire accessible.'
            }
            action={newButton}
          />
        }
      >
        {(prestataires) => {
          // Slug d'URL lisible et unique parmi les prestataires (mêmes `siblings`
          // qu'à la résolution côté détail → l'URL se relit à l'identique).
          const sibs = prestataires.map((p) => ({ nom: p.libelle, id: p.id }))
          const q = search.trim().toLowerCase()
          const shown = q
            ? prestataires.filter((p) => p.libelle.toLowerCase().includes(q))
            : prestataires
          return (
            <div className="flex flex-col gap-4">
              <ListFilterBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Rechercher un prestataire…"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucun prestataire ne correspond à cette recherche." />
              ) : (
                <div className={listStack}>
                  {shown.map((p) => {
                    const rowActions = actionsEditionSuppression({
                      onModifier: canManage
                        ? () => dialog.openEdit(p)
                        : undefined,
                      onSupprimer:
                        canManage && !p.est_interne
                          ? () => suppression.demander(p)
                          : undefined,
                    })
                    const nb = counts?.get(p.id) ?? 0
                    return (
                      <ListRow
                        key={p.id}
                        media={
                          <MiniatureThumb
                            url={urlOf(p.miniature_id)}
                            fallback={<Truck className="size-10" />}
                            alt=""
                            onError={refreshMiniatures}
                            className="size-full rounded-none"
                          />
                        }
                        title={p.libelle}
                        subtitle={p.commentaires ?? undefined}
                        badges={
                          <Badge
                            variant={p.est_interne ? 'default' : 'secondary'}
                          >
                            {p.est_interne ? 'Interne' : 'Externe'}
                          </Badge>
                        }
                        meta={`${String(nb)} contrat${nb > 1 ? 's' : ''}`}
                        mobileMeta={p.est_interne ? 'Interne' : 'Externe'}
                        onClick={() =>
                          void navigate({
                            to: '/prestataires/$prestataire',
                            params: {
                              prestataire: segOfUnique(
                                { nom: p.libelle, id: p.id },
                                sibs,
                              ),
                            },
                          })
                        }
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
        <PrestataireFormDialog
          key={dialog.dialogKey}
          open={dialog.open}
          onOpenChange={dialog.onOpenChange}
          siteId={siteId}
          prestataire={dialog.entity}
        />
      )}

      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={
          suppression.toDelete
            ? `le prestataire « ${suppression.toDelete.libelle} »`
            : 'le prestataire'
        }
        blocked={nbContratsToDelete > 0}
        blockedReason={`Ce prestataire est rattaché à ${String(nbContratsToDelete)} contrat(s) sur ce site. Supprime-les d'abord pour pouvoir le supprimer.`}
        warning="Si ce prestataire est rattaché à des gammes, la suppression sera refusée : détache-le d'abord."
      />
    </PageContainer>
  )
}
