import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import {
  investissementsQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import { useDeleteInvestissement } from '@/features/investissements/mutations'
import {
  nomStatutCapex,
  variantStatutCapex,
} from '@/features/investissements/etat'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from '@/features/investissements/components/investissement-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
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
import type { RowAction } from '@/components/common/row-actions'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { SearchInput } from '@/components/common/search-input'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  const [form, setForm] = useState<{
    open: boolean
    investissement: Investissement | null
  }>({ open: false, investissement: null })
  const [toDelete, setToDelete] = useState<Investissement | null>(null)
  const [recherche, setRecherche] = useState('')

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Investissement supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const newButton = canManage ? (
    <Button onClick={() => setForm({ open: true, investissement: null })}>
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
              onClick={() => setForm({ open: true, investissement: null })}
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
          const shown =
            q === ''
              ? investissements
              : investissements.filter(
                  (inv) =>
                    inv.libelle.toLowerCase().includes(q) ||
                    (inv.description ?? '').toLowerCase().includes(q),
                )
          // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
          // fiche détail (symétrie segOfUnique).
          const sibs = investissements.map((i) => ({
            nom: i.libelle,
            id: i.id,
          }))
          return (
            <div className="flex flex-col gap-4">
              <SearchInput
                value={recherche}
                onChange={setRecherche}
                placeholder="Rechercher un investissement…"
                className="max-w-sm"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucun investissement ne correspond à cette recherche." />
              ) : (
                <div className={listStack}>
                  {shown.map((inv) => {
                    const statutLabel = nomStatutCapex(
                      inv.statut_capex_id,
                      statutNom,
                    )
                    const { label: ecartLabel, depassement } = ecartCapex(inv)
                    const rowActions: RowAction[] = []
                    if (canManage)
                      rowActions.push({
                        label: 'Modifier',
                        icon: Pencil,
                        onSelect: () =>
                          setForm({ open: true, investissement: inv }),
                      })
                    if (canManage && canDelete)
                      rowActions.push({
                        label: 'Supprimer',
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => setToDelete(inv),
                      })
                    return (
                      <ListRow
                        key={inv.id}
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
                          <Badge
                            variant={variantStatutCapex(inv.statut_capex_id)}
                          >
                            {statutLabel}
                          </Badge>
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
        <InvestissementFormDialog
          key={`${form.investissement?.id ?? 'new'}-${String(form.open)}`}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          investissement={form.investissement}
        />
      )}

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete
            ? `l'investissement « ${toDelete.libelle} »`
            : "l'investissement"
        }
        warning="Cette suppression est définitive et retire le suivi budgétaire de cet investissement."
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
