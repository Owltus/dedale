import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ShieldOff, UserPlus, Users } from 'lucide-react'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { InviteUserDialog } from '@/features/utilisateurs/components/invite-user-dialog'
import { UtilisateurDetail } from '@/features/utilisateurs/components/utilisateur-detail'
import { roleLabel } from '@/features/utilisateurs/schemas'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/utilisateurs')({
  beforeLoad: ({ context }) => requireNav('/utilisateurs', context.queryClient),
  component: UtilisateursPage,
})

function UtilisateursPage() {
  const { data: role, isPending: rolePending } = useCurrentRole()
  const { session } = useAuth()
  const canManage = perm.canManageAdmin(role)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query = useQuery({
    ...utilisateursQueries.list(),
    enabled: canManage,
  })

  // Accès réservé admin/manager. Garde primaire = le beforeLoad de la route
  // (requireNav redirige les autres rôles avant le rendu) ; ce garde-fou
  // composant ne sert plus que de filet pour le cas fail-open (rôle non résolu
  // en amont), où il refuse proprement l'accès.
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

  if (selectedId) {
    return (
      <UtilisateurDetail
        userId={selectedId}
        onBack={() => setSelectedId(null)}
      />
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
        action={inviteButton}
      />

      <QueryState
        query={query}
        pending={
          <CardSkeletons
            count={4}
            height="h-16"
            container="flex flex-col gap-3"
          />
        }
      >
        {(allUsers) => {
          // On ne se liste jamais soi-même : son propre profil se gère depuis
          // la sidebar (« Mon profil »).
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
          return (
            <div className="flex flex-col gap-2">
              {users.map((u) => (
                <Card
                  key={u.id}
                  className="hover:bg-accent/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedId(u.id)}
                >
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">
                        {u.nom_complet}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
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
                      </div>
                    </div>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </CardContent>
                </Card>
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
