import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ShieldOff, UserPlus, Users } from 'lucide-react'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { InviteUserDialog } from '@/features/utilisateurs/components/invite-user-dialog'
import { UtilisateurDetail } from '@/features/utilisateurs/components/utilisateur-detail'
import { roleLabel } from '@/features/utilisateurs/schemas'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/utilisateurs')({
  component: UtilisateursPage,
})

function UtilisateursPage() {
  const { data: role, isPending: rolePending } = useCurrentRole()
  const { session } = useAuth()
  const canManage = role === 'admin' || role === 'manager'
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const {
    data: allUsers = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ ...utilisateursQueries.list(), enabled: canManage })

  // On ne se liste jamais soi-même : son propre profil se gère depuis la
  // sidebar (« Mon profil »).
  const users = allUsers.filter((u) => u.id !== session?.user.id)

  // Garde-fou d'accès : réservé admin/manager.
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

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description="Invite un premier utilisateur pour commencer."
          action={inviteButton}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <Card
              key={u.id}
              className="hover:bg-accent/40 cursor-pointer transition-colors"
              onClick={() => setSelectedId(u.id)}
            >
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{u.nom_complet}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{roleLabel(u.roles.code)}</Badge>
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
      )}

      <InviteUserDialog
        key={inviteOpen ? 'open' : 'closed'}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        callerRole={role}
      />
    </PageContainer>
  )
}
