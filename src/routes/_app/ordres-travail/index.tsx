import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import type { DocumentMeta } from '@/features/documents/format'
import { OT_QUERY_KEYS } from '@/features/ordres-travail/query-keys'
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
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import type { RowAction } from '@/components/common/row-actions'
import { useAuth } from '@/auth'
import { deleteErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { FILTRE_NON_TERMINES } from '@/components/common/list-filter-bar'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/ordres-travail/page-meta'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/ordres-travail/')({
  component: OrdresTravailPage,
})

function OrdresTravailPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        <OrdresTravailContent siteId={siteId} canManage={canManage} />
      )}
    </SiteScopedRoute>
  )
}

function OrdresTravailContent({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const { session } = useAuth()
  // Mise à jour LIVE : un changement d'OT (clôture, statut…) rafraîchit la liste sans F5.
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)
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
  // « Non terminés » par défaut, comme Demandes, Travaux, Investissements et
  // l'onglet OT d'un prestataire : sur un site à historique importé, ouvrir sur
  // FILTRE_TOUS noyait la page sous des centaines d'OT clôturés.
  const [statutFilter, setStatutFilter] = useState<string>(FILTRE_NON_TERMINES)

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

  // Documents rattachés aux OT du site, en UNE requête groupée filtrée par site
  // (pas par liste d'ids : un `.in()` sur des centaines d'OT dépasse la taille
  // d'URL autorisée et échoue en 400) → map `ot_id → DocumentMeta[]`.
  const documentsQuery = useQuery(ordresTravailQueries.documentsParOt(siteId))
  const documentsParOt =
    documentsQuery.data ?? new Map<string, DocumentMeta[]>()

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
        title={PAGE_META.titre}
        description={PAGE_META.description}
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
            <ListPageBody
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher un ordre de travail…"
              filterValue={statutFilter}
              onFilterChange={setStatutFilter}
              options={statutOtFilterOptions()}
              filterLabel="Filtrer par statut"
              sticky
              isEmpty={filtered.length === 0}
              emptySearchDescription="Aucun ordre de travail ne correspond à ces critères."
            >
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
                    documents={documentsParOt.get(ot.id) ?? []}
                  />
                )
              })}
            </ListPageBody>
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
