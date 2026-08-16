import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ShieldOff, User, UserPlus, Users } from 'lucide-react'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { CreerCompteDialog } from '@/features/utilisateurs/components/creer-compte-dialog'
import { roleLabel } from '@/features/utilisateurs/schemas'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/utilisateurs/')({
  component: UtilisateursIndexPage,
})

function UtilisateursIndexPage() {
  const navigate = useNavigate()
  const { data: role, isPending: rolePending } = useCurrentRole()
  const { session } = useAuth()
  const canManage = perm.canManageAdmin(role)
  const [creerOpen, setCreerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const query = useQuery({ ...utilisateursQueries.list(), enabled: canManage })
  // Liste en LIVE (arrivée/départ d'un utilisateur visible sans F5).
  useRealtimeRefresh('users', utilisateursQueries.all())

  // Garde primaire = beforeLoad de la route (requireNav). Filet composant pour le
  // cas fail-open (rôle non résolu) : on refuse proprement l'accès.
  if (rolePending) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-48" />
      </PageContainer>
    )
  }
  if (!canManage) {
    return (
      <PageContainer>
        <PageHeader title="Utilisateurs" />
        <EmptyState
          icon={ShieldOff}
          title="Accès réservé"
          description="Cette page est réservée aux administrateurs et managers."
        />
      </PageContainer>
    )
  }

  const creerButton = (
    <Button onClick={() => setCreerOpen(true)}>
      <UserPlus /> Nouveau compte
    </Button>
  )

  return (
    <PageContainer>
      <PageHeader
        title="Utilisateurs"
        description="Gère les comptes : profil, rôle, sites attribués, accès."
        action={
          <TooltipIconButton
            icon={<UserPlus />}
            label="Créer un compte"
            variant="outline"
            onClick={() => setCreerOpen(true)}
          />
        }
      />

      <QueryState query={query} pending={<ListRowSkeletons />}>
        {(allUsers) => {
          // On ne se liste jamais soi-même : son profil se gère depuis la sidebar.
          const users = allUsers.filter((u) => u.id !== session?.user.id)
          if (users.length === 0) {
            return (
              <EmptyState
                icon={Users}
                title="Aucun utilisateur"
                description="Crée un premier compte pour commencer."
                action={creerButton}
              />
            )
          }
          // Mêmes « frères » qu'à la résolution côté détail (self exclu des deux
          // côtés) → le slug d'URL se relit à l'identique.
          const sibs = users.map((u) => ({ nom: u.nom_complet, id: u.id }))
          const q = search.trim().toLowerCase()
          const shown =
            q === ''
              ? users
              : users.filter(
                  (u) =>
                    u.nom_complet.toLowerCase().includes(q) ||
                    roleLabel(u.roles.code).toLowerCase().includes(q),
                )
          return (
            <ListPageBody
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher un utilisateur…"
              isEmpty={shown.length === 0}
              emptySearchDescription="Aucun utilisateur ne correspond à cette recherche."
            >
              {shown.map((u) => (
                <ListRow
                  key={u.id}
                  media={<RowMediaIcon icon={User} />}
                  title={u.nom_complet}
                  badges={
                    <>
                      <Badge variant="secondary">
                        {roleLabel(u.roles.code)}
                      </Badge>
                      {u.est_actif ? (
                        <Badge variant="outline">Actif</Badge>
                      ) : (
                        // ÉTAT, donc pastille TEINTÉE (StatusBadge) : l'aplat
                        // rouge de `Badge variant="destructive"` est réservé aux
                        // ACTIONS destructrices. C'était le seul de l'app.
                        <StatusBadge tone="destructive">Inactif</StatusBadge>
                      )}
                      {u.anonymized_at && (
                        <Badge variant="outline">Anonymisé</Badge>
                      )}
                    </>
                  }
                  mobileMeta={roleLabel(u.roles.code)}
                  onClick={() =>
                    void navigate({
                      to: '/utilisateurs/$utilisateur',
                      params: {
                        utilisateur: segOfUnique(
                          { nom: u.nom_complet, id: u.id },
                          sibs,
                        ),
                      },
                    })
                  }
                />
              ))}
            </ListPageBody>
          )
        }}
      </QueryState>

      <CreerCompteDialog
        key={creerOpen ? 'open' : 'closed'}
        open={creerOpen}
        onOpenChange={setCreerOpen}
        callerRole={role}
      />
    </PageContainer>
  )
}
