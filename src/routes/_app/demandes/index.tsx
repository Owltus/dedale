import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { demandesQueries } from '@/features/demandes/queries'
import { DiFormDialog } from '@/features/demandes/components/di-form-dialog'
import { DiEditDialog } from '@/features/demandes/components/di-edit-dialog'
import { useDeleteDemande } from '@/features/demandes/mutations'
import { diTitre } from '@/features/demandes/schemas'
import { statutBadgeVariant, statutLabel } from '@/features/demandes/etat'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { deleteErrorMessage } from '@/lib/form'
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
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { SearchInput } from '@/components/common/search-input'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type Demande = Database['public']['Tables']['demandes_intervention']['Row']

export const Route = createFileRoute('/_app/demandes/')({
  component: DemandesPage,
})

function DemandesPage() {
  const { data: role } = useCurrentRole()
  const { session } = useAuth()
  // lecteur = lecture seule ; les autres rôles peuvent créer une DI (RLS arbitre).
  const canCreate = perm.canCreateDemande(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Demandes d'intervention"
        description="Signalements curatifs du site."
        hint="Choisis un site pour voir ses demandes d'intervention."
        icon={ClipboardList}
      />
    )
  }

  return (
    <DemandesContent
      siteId={activeSiteId}
      canCreate={canCreate}
      role={role}
      userId={session?.user.id}
    />
  )
}

function DemandesContent({
  siteId,
  canCreate,
  role,
  userId,
}: {
  siteId: string
  canCreate: boolean
  role: perm.Role
  userId: string | undefined
}) {
  const navigate = useNavigate()
  const query = useQuery(demandesQueries.list(siteId))
  const del = useDeleteDemande()
  const [formOpen, setFormOpen] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [editDemande, setEditDemande] = useState<Demande | null>(null)
  const [toDelete, setToDelete] = useState<Demande | null>(null)

  const newButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus /> Nouvelle demande
    </Button>
  ) : undefined

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Demande supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  return (
    <PageContainer>
      <PageHeader
        title="Demandes d'intervention"
        description="Signalements curatifs du site (constat, suivi, résolution)."
        action={
          canCreate ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Nouvelle demande"
              variant="outline"
              onClick={() => setFormOpen(true)}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="Aucune demande"
            description={
              canCreate
                ? "Crée une première demande d'intervention pour signaler un problème."
                : "Aucune demande d'intervention pour ce site."
            }
            action={newButton}
          />
        }
      >
        {(demandes) => {
          const q = recherche.trim().toLowerCase()
          const shown = q
            ? demandes.filter(
                (d) =>
                  diTitre(d.constat).toLowerCase().includes(q) ||
                  d.constat.toLowerCase().includes(q),
              )
            : demandes
          // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
          // fiche détail (symétrie segOfUnique), sur la liste NON filtrée.
          const sibs = demandes.map((d) => ({
            nom: diTitre(d.constat),
            id: d.id,
          }))
          return (
            <div className="flex flex-col gap-4">
              <SearchInput
                value={recherche}
                onChange={setRecherche}
                placeholder="Rechercher une demande…"
                className="max-w-sm"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucune demande ne correspond à cette recherche." />
              ) : (
                <div className={listStack}>
                  {shown.map((d) => {
                    // Édition ET suppression décidées PAR LIGNE : propriété + statut
                    // pour le demandeur (son scope) ; toujours vrai pour admin/manager/tech.
                    const canEdit = perm.canEditDemande(role, d, userId)
                    const canDelete = perm.canDeleteDemande(role, d, userId)
                    const showActions = canEdit || canDelete
                    return (
                      <ListRow
                        key={d.id}
                        media={<RowMediaIcon icon={ClipboardList} />}
                        title={diTitre(d.constat)}
                        subtitle={`Constaté le ${formatDate(d.date_constat)}`}
                        onClick={() =>
                          void navigate({
                            to: '/demandes/$demande',
                            params: {
                              demande: segOfUnique(
                                { nom: diTitre(d.constat), id: d.id },
                                sibs,
                              ),
                            },
                          })
                        }
                        badges={
                          <Badge variant={statutBadgeVariant(d.statut_di_id)}>
                            {statutLabel(d.statut_di_id)}
                          </Badge>
                        }
                        mobileMeta={statutLabel(d.statut_di_id)}
                        actions={
                          showActions ? (
                            <>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Modifier la demande"
                                  onClick={() => setEditDemande(d)}
                                >
                                  <Pencil />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Supprimer la demande"
                                  onClick={() => setToDelete(d)}
                                >
                                  <Trash2 />
                                </Button>
                              )}
                            </>
                          ) : undefined
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

      {canCreate && (
        <DiFormDialog
          key={formOpen ? 'open' : 'closed'}
          open={formOpen}
          onOpenChange={setFormOpen}
          siteId={siteId}
        />
      )}

      <DiEditDialog
        key={editDemande?.id ?? 'none'}
        open={editDemande !== null}
        onOpenChange={(o) => {
          if (!o) setEditDemande(null)
        }}
        demande={editDemande}
        siteId={siteId}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null)
        }}
        title="Supprimer la demande ?"
        description={
          toDelete
            ? `« ${diTitre(toDelete.constat)} » sera supprimée définitivement.`
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
