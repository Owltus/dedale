import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { demandesQueries } from '@/features/demandes/queries'
import { DiFormDialog } from '@/features/demandes/components/di-form-dialog'
import { DiEditDialog } from '@/features/demandes/components/di-edit-dialog'
import {
  useDeleteDemande,
  useReopenDemande,
  usePrendreEnCharge,
  useCloturerDemande,
} from '@/features/demandes/mutations'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { diTitre } from '@/features/demandes/schemas'
import {
  statutLabel,
  statutTone,
  STATUTS_DI_TERMINAUX,
} from '@/features/demandes/etat'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useAuth } from '@/auth'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
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
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/status-badge'
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
  const reopen = useReopenDemande()
  const enCharge = usePrendreEnCharge()
  const cloturer = useCloturerDemande()
  // Changement de statut (Ouvert/En cours/Clôturé) via le menu : rôles métier.
  const canResolve = perm.canResolveDemande(role)
  // Liste LIVE : tout INSERT/UPDATE/DELETE sur demandes_intervention (n'importe
  // quelle fenêtre, n'importe quel utilisateur du site) rafraîchit la liste sans F5.
  useRealtimeRefresh('demandes_intervention', demandesQueries.all())

  // Noms des créateurs (la RLS users filtre : un rôle métier voit ses pairs de
  // site ; un demandeur ne voit que LUI → ses DI affichent son nom, pas celles
  // des autres). id → nom_complet pour un accès O(1) par ligne.
  const { data: users = [] } = useQuery(utilisateursQueries.list())
  const usersById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) if (u.nom_complet) m.set(u.id, u.nom_complet)
    return m
  }, [users])

  // Nom du local de chaque DI (di_id → local) : affiché en carte ET cible de
  // recherche. Une seule requête RLS-scopée pour toute la liste (pas de N+1).
  const { data: locLinks = [] } = useQuery(
    demandesQueries.locauxParDi(siteId),
  )
  const localParDi = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of locLinks) {
      const nom = r.locaux.nom
      if (nom && !m.has(r.di_id)) m.set(r.di_id, nom)
    }
    return m
  }, [locLinks])
  const [formOpen, setFormOpen] = useState(false)
  const [recherche, setRecherche] = useState('')
  // Filtre statut : 'all' ou l'id de statut (1 Ouvert, 2 En cours, 3 Clôturé).
  // Défaut : on masque les demandes clôturées — le filtre permet d'afficher un
  // statut précis ou « Tous les statuts ».
  const [statutFilter, setStatutFilter] = useState(FILTRE_NON_TERMINES)
  const editDialog = useEntityDialog<Demande>()
  const suppression = useConfirmDelete<Demande>({
    onDelete: (d) => del.mutateAsync(d.id),
    successMessage: 'Demande supprimée',
  })

  const newButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus /> Nouvelle demande
    </Button>
  ) : undefined

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
          // Filtre statut + recherche (constat ET nom du local).
          const shown = demandes.filter((d) => {
            if (
              !matchStatutFilter(d.statut_di_id, statutFilter, STATUTS_DI_TERMINAUX)
            )
              return false
            if (q === '') return true
            const local = localParDi.get(d.id) ?? ''
            return (
              d.constat.toLowerCase().includes(q) ||
              local.toLowerCase().includes(q)
            )
          })
          // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
          // fiche détail (symétrie segOfUnique), sur la liste NON filtrée.
          const sibs = demandes.map((d) => ({
            nom: diTitre(d.constat),
            id: d.id,
          }))
          return (
            <div className="flex flex-col gap-4">
              <ListFilterBar
                search={recherche}
                onSearchChange={setRecherche}
                searchPlaceholder="Rechercher (constat, local…)"
                filterValue={statutFilter}
                onFilterChange={setStatutFilter}
                options={statutFilterOptions([
                  { id: 1, nom: statutLabel(1) },
                  { id: 2, nom: statutLabel(2) },
                  { id: 3, nom: statutLabel(3) },
                ])}
                filterLabel="Filtrer par statut"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucune demande ne correspond à ces critères." />
              ) : (
                <div className={listStack}>
                  {shown.map((d) => {
                    // Édition ET suppression décidées PAR LIGNE : propriété + statut
                    // pour le demandeur (son scope) ; toujours vrai pour admin/manager/tech.
                    const canEdit = perm.canEditDemande(role, d, userId)
                    const canDelete = perm.canDeleteDemande(role, d, userId)
                    const rowActions: RowAction[] = []
                    // Groupe « statut » EN HAUT (rôles métier) : icône colorée —
                    // Ouvert gris, En cours orange, Clôturé vert. Statut courant
                    // désactivé ; Clôturer ouvre la saisie de la note (dialog).
                    if (canResolve) {
                      rowActions.push({
                        label: 'Ouvert',
                        icon: Circle,
                        iconClassName: 'text-muted-foreground',
                        disabled: d.statut_di_id === 1,
                        onSelect: () =>
                          reopen.mutate(d.id, {
                            onSuccess: () => toast.success('Demande rouverte'),
                            onError: (e) => toast.error(writeErrorMessage(e)),
                          }),
                      })
                      rowActions.push({
                        label: 'En cours',
                        icon: Clock,
                        iconClassName: 'text-warning',
                        disabled: d.statut_di_id === 2,
                        onSelect: () =>
                          enCharge.mutate(d.id, {
                            onSuccess: () =>
                              toast.success('Demande prise en charge'),
                            onError: (e) => toast.error(writeErrorMessage(e)),
                          }),
                      })
                      rowActions.push({
                        label: 'Clôturé',
                        icon: CheckCircle2,
                        iconClassName: 'text-success',
                        disabled: d.statut_di_id === 3,
                        onSelect: () =>
                          cloturer.mutate(d.id, {
                            onSuccess: () => toast.success('Demande clôturée'),
                            onError: (e) => toast.error(writeErrorMessage(e)),
                          }),
                      })
                    }
                    // Modifier / Supprimer EN BAS, séparés du groupe statut.
                    const sep = rowActions.length > 0
                    if (canEdit)
                      rowActions.push({
                        label: 'Modifier',
                        icon: Pencil,
                        separatorBefore: sep,
                        onSelect: () => editDialog.openEdit(d),
                      })
                    if (canDelete)
                      rowActions.push({
                        label: 'Supprimer',
                        icon: Trash2,
                        destructive: true,
                        separatorBefore: sep && !canEdit,
                        onSelect: () => suppression.demander(d),
                      })
                    const createur = d.created_by
                      ? (usersById.get(d.created_by) ?? null)
                      : null
                    const local = localParDi.get(d.id) ?? null
                    const ligne = createur
                      ? `Signalé par ${createur} · le ${formatDate(d.date_constat)}`
                      : `Constaté le ${formatDate(d.date_constat)}`
                    return (
                      <ListRow
                        key={d.id}
                        tone={statutTone(d.statut_di_id)}
                        media={<RowMediaIcon icon={ClipboardList} />}
                        title={diTitre(d.constat)}
                        subtitle={local ? `${local} · ${ligne}` : ligne}
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
                          <StatusBadge tone={statutTone(d.statut_di_id)}>
                            {statutLabel(d.statut_di_id)}
                          </StatusBadge>
                        }
                        mobileMeta={
                          local
                            ? `${local} · ${statutLabel(d.statut_di_id)}`
                            : statutLabel(d.statut_di_id)
                        }
                        menuActions={rowActions.length ? rowActions : undefined}
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
        key={editDialog.dialogKey}
        open={editDialog.open}
        onOpenChange={editDialog.onOpenChange}
        demande={editDialog.entity}
        siteId={siteId}
      />

      <ConfirmDialog
        {...suppression.dialogProps}
        title="Supprimer la demande ?"
        description={
          suppression.toDelete
            ? `« ${diTitre(suppression.toDelete.constat)} » sera supprimée définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
      />
    </PageContainer>
  )
}
