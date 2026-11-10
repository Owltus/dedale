import { useState } from 'react'
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
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
} from '@/features/investissements/etat'
import { ecartCapex, montantPrincipal } from '@/features/investissements/format'
import { anneeDeParam } from '@/features/investissements/annee'
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
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/investissements/page-meta'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { StatutColonne } from '@/components/common/statut-colonne'
import { BarreBudget } from '@/features/investissements/components/barre-budget'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export const Route = createFileRoute('/_app/investissements/$annee/')({
  component: BudgetAnneePage,
})

/** Les investissements d'UNE année de budget (138). */
function BudgetAnneePage() {
  const annee = anneeDeParam(Route.useParams().annee)
  // Ancien lien (/investissements/<dossier>) ou année invalide → la liste des années.
  if (annee === null) return <Navigate to="/investissements" replace />
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Investissements = écran MÉTIER (cf. RLS) : manager/technicien
        // créent/éditent ET SUPPRIMENT sur leurs sites (migration 053),
        // lecteur consulte.
        <InvestissementsContent
          annee={annee}
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
  )
}

function InvestissementsContent({
  annee,
  siteId,
  canManage,
  canDelete,
}: {
  annee: number
  siteId: string
  canManage: boolean
  canDelete: boolean
}) {
  const navigate = useNavigate()
  const query = useQuery(investissementsQueries.parAnnee(siteId, annee))
  // Liste en LIVE (création/changement de statut visible sans F5).
  useRealtimeRefresh('investissements', investissementsQueries.all())
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const del = useDeleteInvestissement()
  const form = useEntityDialog<Investissement>()
  const suppression = useConfirmDelete<Investissement>({
    onDelete: (inv) => del.mutateAsync(inv.id),
    successMessage: 'Investissement supprimé',
  })
  // Pas de filtre par statut (demande PO) : un budget montre TOUS ses
  // dossiers ; seule la recherche reste.
  const [recherche, setRecherche] = useState('')

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))

  const newButton = canManage ? (
    <Button onClick={form.openCreate}>
      <Plus /> Nouvel investissement
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title={`Budget ${String(annee)}`}
        breadcrumb={[
          {
            label: PAGE_META.titre,
            onClick: () => void navigate({ to: '/investissements' }),
          },
        ]}
        // La barre du budget EST la description (demande PO).
        description={
          query.data && query.data.length > 0 ? (
            <BarreBudget
              investissements={query.data}
              noms={statutNom}
              className="mt-0.5"
            />
          ) : (
            'Aucune demande pour cette année.'
          )
        }
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
            title={`Aucune demande pour le budget ${String(annee)}`}
            description={
              canManage
                ? 'Ajoute une première demande d’investissement pour cette année.'
                : 'Aucun investissement enregistré pour cette année.'
            }
            action={newButton}
          />
        }
      >
        {(investissements) => {
          const q = recherche.trim().toLowerCase()
          const shown = investissements.filter((inv) => {
            if (q === '') return true
            return (
              inv.libelle.toLowerCase().includes(q) ||
              (inv.fournisseur ?? '').toLowerCase().includes(q) ||
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
              searchPlaceholder="Rechercher un investissement, un fournisseur…"
              isEmpty={shown.length === 0}
              emptySearchDescription="Aucun investissement ne correspond à cette recherche."
            >
              {shown.map((inv) => {
                const statutLabel = nomStatutCapex(
                  inv.statut_capex_id,
                  statutNom,
                )
                const { depassement } = ecartCapex(inv)
                const colonne = (
                  <StatutColonne
                    statut={{
                      label: statutLabel,
                      tone: statutCapexTone(inv.statut_capex_id),
                    }}
                    meta={
                      <span
                        className={cn(
                          'font-medium whitespace-nowrap text-foreground tabular-nums',
                          depassement && 'text-warning',
                        )}
                      >
                        {montantPrincipal(inv)}
                      </span>
                    }
                  />
                )
                return (
                  <ListRow
                    key={inv.id}
                    tone={statutCapexTone(inv.statut_capex_id)}
                    media={<RowMediaIcon icon={Wallet} />}
                    title={inv.libelle}
                    // Le fournisseur en tête (141), puis la description.
                    subtitle={[
                      inv.fournisseur,
                      inv.description?.trim()
                        ? inv.description
                        : `Demandé le ${formatDate(inv.date_demande)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onClick={() =>
                      void navigate({
                        to: '/investissements/$annee/$investissement',
                        params: {
                          annee: String(annee),
                          investissement: segOfUnique(
                            { nom: inv.libelle, id: inv.id },
                            sibs,
                          ),
                        },
                      })
                    }
                    // Même gabarit que les cartes d'ordres de travail
                    // (demande PO) : colonne `StatutColonne` à largeur fixe,
                    // badge en haut, montant CENTRÉ dessous — alignés d'une
                    // carte à l'autre, au bureau comme sur téléphone.
                    badges={colonne}
                    mobileBadge={colonne}
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
          annee={annee}
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

/** « 3 dossiers · 5 000 € demandés · 1 200 € validés » pour l'année. */
