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
import { DiResolveDialog } from '@/features/demandes/components/di-resolve-dialog'
import {
  useDeleteDemande,
  useReopenDemande,
  usePrendreEnCharge,
} from '@/features/demandes/mutations'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { diTitre } from '@/features/demandes/schemas'
import { statutBadgeVariant, statutLabel } from '@/features/demandes/etat'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useAuth } from '@/auth'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { deleteErrorMessage, writeErrorMessage } from '@/lib/form'
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
import { SearchInput } from '@/components/common/search-input'
import { Select } from '@/components/ui/select'
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
  const reopen = useReopenDemande()
  const enCharge = usePrendreEnCharge()
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
  const { data: locLinks = [] } = useQuery(demandesQueries.locauxParDi())
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
  const [statutFilter, setStatutFilter] = useState('all')
  const [editDemande, setEditDemande] = useState<Demande | null>(null)
  const [toDelete, setToDelete] = useState<Demande | null>(null)
  const [cloturerDemande, setCloturerDemande] = useState<Demande | null>(null)

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
          // Filtre statut + recherche (constat ET nom du local).
          const shown = demandes.filter((d) => {
            if (
              statutFilter !== 'all' &&
              d.statut_di_id !== Number(statutFilter)
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchInput
                  value={recherche}
                  onChange={setRecherche}
                  placeholder="Rechercher (constat, local…)"
                  className="flex-1"
                />
                <Select
                  value={statutFilter}
                  onChange={(e) => setStatutFilter(e.target.value)}
                  aria-label="Filtrer par statut"
                  className="sm:w-52"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="1">{statutLabel(1)}</option>
                  <option value="2">{statutLabel(2)}</option>
                  <option value="3">{statutLabel(3)}</option>
                </Select>
              </div>
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
                        onSelect: () => setCloturerDemande(d),
                      })
                    }
                    // Modifier / Supprimer EN BAS, séparés du groupe statut.
                    const sep = rowActions.length > 0
                    if (canEdit)
                      rowActions.push({
                        label: 'Modifier',
                        icon: Pencil,
                        separatorBefore: sep,
                        onSelect: () => setEditDemande(d),
                      })
                    if (canDelete)
                      rowActions.push({
                        label: 'Supprimer',
                        icon: Trash2,
                        destructive: true,
                        separatorBefore: sep && !canEdit,
                        onSelect: () => setToDelete(d),
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
                          <Badge variant={statutBadgeVariant(d.statut_di_id)}>
                            {statutLabel(d.statut_di_id)}
                          </Badge>
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

      <DiResolveDialog
        key={cloturerDemande?.id ?? 'none'}
        open={cloturerDemande !== null}
        onOpenChange={(o) => {
          if (!o) setCloturerDemande(null)
        }}
        diId={cloturerDemande?.id ?? ''}
      />
    </PageContainer>
  )
}
