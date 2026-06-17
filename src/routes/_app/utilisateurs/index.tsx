import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ShieldOff, User, UserPlus, Users } from 'lucide-react'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { InviteUserDialog } from '@/features/utilisateurs/components/invite-user-dialog'
import { roleLabel } from '@/features/utilisateurs/schemas'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { listStack } from '@/lib/responsive'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
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
  const [inviteOpen, setInviteOpen] = useState(false)

  const query = useQuery({ ...utilisateursQueries.list(), enabled: canManage })

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

  const inviteButton = (
    <Button onClick={() => setInviteOpen(true)}>
      <UserPlus /> Inviter
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
            label="Inviter un utilisateur"
            variant="default"
            onClick={() => setInviteOpen(true)}
          />
        }
      />

      <QueryState query={query} pending={<ListRowSkeletons count={4} />}>
        {(allUsers) => {
          // On ne se liste jamais soi-même : son profil se gère depuis la sidebar.
          const users = allUsers.filter((u) => u.id !== session?.user.id)
          if (users.length === 0) {
            return (
              <EmptyState
                icon={Users}
                title="Aucun utilisateur"
                description="Invite un premier utilisateur pour commencer."
                action={inviteButton}
              />
            )
          }
          // Mêmes « frères » qu'à la résolution côté détail (self exclu des deux
          // côtés) → le slug d'URL se relit à l'identique.
          const sibs = users.map((u) => ({ nom: u.nom_complet, id: u.id }))
          return (
            <div className={listStack}>
              {users.map((u) => (
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
                        <Badge variant="destructive">Inactif</Badge>
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
            </div>
          )
        }}
      </QueryState>

      <InviteUserDialog
        key={inviteOpen ? 'open' : 'closed'}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        callerRole={role}
      />
    </PageContainer>
  )
}
