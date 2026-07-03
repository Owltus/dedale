import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Wallet } from 'lucide-react'
import {
  investissementsQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import { useDeleteInvestissement } from '@/features/investissements/mutations'
import {
  nomStatutCapex,
  statutCapexTone,
  rangStatutCapex,
  STATUTS_CAPEX_TERMINAUX,
} from '@/features/investissements/etat'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from '@/features/investissements/components/investissement-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { segOfUnique } from '@/lib/slug'
import { cn } from '@/lib/utils'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { actionsEditionSuppression } from '@/components/common/row-actions'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  ListFilterBar,
  matchStatutFilter,
  statutFilterOptions,
  FILTRE_NON_TERMINES,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/status-badge'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export const Route = createFileRoute('/_app/investissements/')({
  component: InvestissementsPage,
})

function InvestissementsPage() {
  const { data: role } = useCurrentRole()
  // Investissements = écran MÉTIER (cf. RLS) : manager/technicien créent/éditent
  // ET SUPPRIMENT sur leurs sites (migration 053), lecteur consulte.
  const canManage = perm.canManageMetier(role)
  const canDelete = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Investissements (CapEx)"
        description="Suivi budgétaire des investissements par site."
        hint="Choisis un site pour voir ses investissements."
        icon={Wallet}
      />
    )
  }

  return (
    <InvestissementsContent
      siteId={activeSiteId}
      canManage={canManage}
      canDelete={canDelete}
    />
  )
}

function InvestissementsContent({
  siteId,
  canManage,
  canDelete,
}: {
  siteId: string
  canManage: boolean
  canDelete: boolean
}) {
  const navigate = useNavigate()
  const query = useQuery(investissementsQueries.list(siteId))
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const del = useDeleteInvestissement()
  const form = useEntityDialog<Investissement>()
  const suppression = useConfirmDelete<Investissement>({
    onDelete: (inv) => del.mutateAsync(inv.id),
    successMessage: 'Investissement supprimé',
  })
  const [recherche, setRecherche] = useState('')
  // Défaut : on masque les investissements terminés (Réalisé/Clôturé/Refusé) —
  // le filtre permet d'afficher un statut précis ou « Tous les statuts ».
  const [statutFilter, setStatutFilter] = useState(FILTRE_NON_TERMINES)

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const statutOptions = statutFilterOptions(
    [...statuts].sort((a, b) => rangStatutCapex(a.id) - rangStatutCapex(b.id)),
  )

  const newButton = canManage ? (
    <Button onClick={form.openCreate}>
      <Plus /> Nouvel investissement
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Investissements (CapEx)"
        description="Suivi budgétaire des investissements du site (montant demandé, prévu, réel)."
        action={
          canManage ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Nouvel investissement"
              variant="outline"
              onClick={form.openCreate}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Wallet}
            title="Aucun investissement"
            description={
              canManage
                ? 'Crée un premier investissement pour suivre son budget.'
                : 'Aucun investissement enregistré pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {(investissements) => {
          const q = recherche.trim().toLowerCase()
          const shown = investissements.filter((inv) => {
            if (
              !matchStatutFilter(
                inv.statut_capex_id,
                statutFilter,
                STATUTS_CAPEX_TERMINAUX,
              )
            )
              return false
            if (q === '') return true
            return (
              inv.libelle.toLowerCase().includes(q) ||
              (inv.description ?? '').toLowerCase().includes(q)
            )
          })
          // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
          // fiche détail (symétrie segOfUnique), sur la liste NON filtrée.
          const sibs = investissements.map((i) => ({
            nom: i.libelle,
            id: i.id,
          }))
          return (
            <div className="flex flex-col gap-4">
              <ListFilterBar
                search={recherche}
                onSearchChange={setRecherche}
                searchPlaceholder="Rechercher un investissement…"
                filterValue={statutFilter}
                onFilterChange={setStatutFilter}
                options={statutOptions}
                filterLabel="Filtrer par statut"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucun investissement ne correspond à ces critères." />
              ) : (
                <div className={listStack}>
                  {shown.map((inv) => {
                    const statutLabel = nomStatutCapex(
                      inv.statut_capex_id,
                      statutNom,
                    )
                    const { label: ecartLabel, depassement } = ecartCapex(inv)
                    return (
                      <ListRow
                        key={inv.id}
                        tone={statutCapexTone(inv.statut_capex_id)}
                        media={<RowMediaIcon icon={Wallet} />}
                        title={inv.libelle}
                        subtitle={
                          inv.description?.trim()
                            ? inv.description
                            : `Demandé le ${formatDate(inv.date_demande)}`
                        }
                        onClick={() =>
                          void navigate({
                            to: '/investissements/$investissement',
                            params: {
                              investissement: segOfUnique(
                                { nom: inv.libelle, id: inv.id },
                                sibs,
                              ),
                            },
                          })
                        }
                        badges={
                          <StatusBadge
                            tone={statutCapexTone(inv.statut_capex_id)}
                          >
                            {statutLabel}
                          </StatusBadge>
                        }
                        meta={
                          <div className="text-right leading-tight tabular-nums">
                            <div className="text-xs">
                              Demandé {formatEuros(inv.montant_demande)}
                            </div>
                            <div className="text-xs">
                              Prévu {formatEuros(inv.montant_prevu)}
                            </div>
                            <div className="text-xs">
                              Réel {formatEuros(inv.depense_reelle)}
                            </div>
                            {ecartLabel !== null && (
                              <div
                                className={cn(
                                  'text-sm font-medium',
                                  depassement
                                    ? 'text-warning'
                                    : 'text-foreground',
                                )}
                              >
                                Écart {ecartLabel}
                              </div>
                            )}
                          </div>
                        }
                        mobileMeta={[
                          statutLabel,
                          ecartLabel !== null
                            ? `Écart ${ecartLabel}`
                            : `Prévu ${formatEuros(inv.montant_prevu)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        menuActions={
                          canManage
                            ? actionsEditionSuppression({
                                onModifier: () => form.openEdit(inv),
                                onSupprimer: canDelete
                                  ? () => suppression.demander(inv)
                                  : undefined,
                              })
                            : undefined
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
        <InvestissementFormDialog
          key={form.dialogKey}
          open={form.open}
          onOpenChange={form.onOpenChange}
          siteId={siteId}
          investissement={form.entity}
        />
      )}

      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={
          suppression.toDelete
            ? `l'investissement « ${suppression.toDelete.libelle} »`
            : "l'investissement"
        }
        warning="Cette suppression est définitive et retire le suivi budgétaire de cet investissement."
      />
    </PageContainer>
  )
}
