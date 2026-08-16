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
import { ecartCapex, montantPrincipal } from '@/features/investissements/format'
import { InvestissementFormDialog } from '@/features/investissements/components/investissement-form-dialog'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { actionsEditionSuppression } from '@/components/common/row-actions'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  matchStatutFilter,
  statutFilterOptions,
  FILTRE_NON_TERMINES,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/investissements/page-meta'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/status-badge'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export const Route = createFileRoute('/_app/investissements/')({
  component: InvestissementsPage,
})

function InvestissementsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Investissements = écran MÉTIER (cf. RLS) : manager/technicien
        // créent/éditent ET SUPPRIMENT sur leurs sites (migration 053),
        // lecteur consulte.
        <InvestissementsContent
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
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
  // Liste en LIVE (création/changement de statut visible sans F5).
  useRealtimeRefresh('investissements', investissementsQueries.all())
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
        title={PAGE_META.titre}
        description={PAGE_META.description}
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
        pending={<ListRowSkeletons />}
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
            <ListPageBody
              search={recherche}
              onSearchChange={setRecherche}
              searchPlaceholder="Rechercher un investissement…"
              filterValue={statutFilter}
              onFilterChange={setStatutFilter}
              options={statutOptions}
              filterLabel="Filtrer par statut"
              isEmpty={shown.length === 0}
              emptySearchDescription="Aucun investissement ne correspond à ces critères."
            >
              {shown.map((inv) => {
                const statutLabel = nomStatutCapex(
                  inv.statut_capex_id,
                  statutNom,
                )
                const { depassement } = ecartCapex(inv)
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
                    // UN SEUL bloc à droite, empilé : le statut au-dessus, le
                    // montant en dessous. `badges` et `meta` étaient deux blocs
                    // CÔTE À CÔTE, et comme la largeur du second suivait la
                    // longueur du montant, le badge se décalait d'une ligne à
                    // l'autre. Empilés dans une colonne de largeur fixe, les deux
                    // s'alignent par construction.
                    meta={
                      <div className="flex w-32 flex-col items-end gap-1">
                        <StatusBadge
                          tone={statutCapexTone(inv.statut_capex_id)}
                        >
                          {statutLabel}
                        </StatusBadge>
                        <span
                          className={cn(
                            'text-sm font-medium tabular-nums',
                            depassement && 'text-warning',
                          )}
                        >
                          {montantPrincipal(inv)}
                        </span>
                      </div>
                    }
                    mobileMeta={`${statutLabel} · ${montantPrincipal(inv)}`}
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
            </ListPageBody>
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
