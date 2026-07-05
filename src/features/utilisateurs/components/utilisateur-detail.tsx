import { useQuery } from '@tanstack/react-query'
import { User } from 'lucide-react'
import { utilisateursQueries } from '../queries'
import { roleLabel } from '../schemas'
import type { UserRow } from './utilisateur-types'
import { IdentityCard } from './utilisateur-identite-card'
import { AdminSitesNotice, SitesCard } from './utilisateur-sites-card'
import { AccountCard } from './utilisateur-admin-card'
import * as perm from '@/lib/permissions'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { EmptyState } from '@/components/common/empty-state'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function UtilisateurDetail({
  userId,
  onBack,
}: {
  userId: string
  onBack: () => void
}) {
  const { data: role } = useCurrentRole()
  const isAdmin = perm.isAdmin(role)
  const { session } = useAuth()
  const isSelf = session?.user.id === userId

  const { data: users = [], isPending } = useQuery(utilisateursQueries.list())
  const user = users.find((u) => u.id === userId) as UserRow | undefined
  // Téléphone (résumé du bandeau d'en-tête) ; dédupliqué avec le formulaire Identité
  // (même clé React Query). Hook AVANT tout early-return.
  const { data: telephone } = useQuery(utilisateursQueries.telephone(userId))

  if (isPending) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-48" />
      </PageContainer>
    )
  }
  if (!user) {
    return (
      <PageContainer>
        <PageHeader
          title="Utilisateur introuvable"
          onBack={onBack}
          backLabel="Retour aux utilisateurs"
        />
        <EmptyState
          title="Utilisateur introuvable"
          description="Ce compte n'existe pas ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  const targetRole = user.roles?.code ?? ''
  const targetIsAdmin = perm.isAdmin(targetRole)
  const canEdit = perm.canEditUser(role, targetRole)

  return (
    <PageContainer>
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <PageHeader
          title={user.nom_complet}
          description={roleLabel(targetRole)}
          breadcrumb={[{ label: 'Utilisateurs', onClick: onBack }]}
          titleBadges={
            <>
              <Badge variant={user.est_actif ? 'outline' : 'destructive'}>
                {user.est_actif ? 'Actif' : 'Inactif'}
              </Badge>
              {user.anonymized_at && <Badge variant="outline">Anonymisé</Badge>}
            </>
          }
        />

        <DetailHeaderCard
          fallbackIcon={User}
          fields={[
            { label: 'Rôle', value: roleLabel(targetRole) },
            { label: 'Téléphone', value: telephone ?? null },
            { label: 'État', value: user.est_actif ? 'Actif' : 'Inactif' },
          ]}
        />

        <IdentityCard user={user} isAdmin={isAdmin} canEdit={canEdit} />

        {targetIsAdmin ? (
          <AdminSitesNotice />
        ) : (
          <SitesCard userId={userId} canEdit={canEdit} />
        )}

        {isAdmin && !isSelf && <AccountCard user={user} />}
      </div>
    </PageContainer>
  )
}
