import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ShieldOff, Users } from 'lucide-react'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { UtilisateurDetail } from '@/features/utilisateurs/components/utilisateur-detail'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSlugResolved } from '@/hooks/use-slug-resolved'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/utilisateurs/$utilisateur')({
  component: UtilisateurDetailPage,
})

function UtilisateurDetailPage() {
  const { utilisateur: slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: role, isPending: rolePending } = useCurrentRole()
  const { session } = useAuth()
  const canManage = perm.canManageAdmin(role)
  const query = useQuery({ ...utilisateursQueries.list(), enabled: canManage })

  // Résolution par slug AVEC repli par id (self exclu des deux côtés, comme la
  // liste). Renommer l'utilisateur ouvert ne l'éjecte plus vers « introuvable ».
  const visible = (query.data ?? []).filter((u) => u.id !== session?.user.id)
  const sibs = visible.map((u) => ({ nom: u.nom_complet, id: u.id }))
  const user = useSlugResolved(
    visible,
    slug,
    (u) => segOfUnique({ nom: u.nom_complet, id: u.id }, sibs),
    (freshSlug) =>
      void navigate({
        to: '/utilisateurs/$utilisateur',
        params: { utilisateur: freshSlug },
        replace: true,
      }),
  )

  const goBack = () => void navigate({ to: '/utilisateurs' })

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
  if (query.isPending) {
    return (
      <PageContainer>
        <PageHeader title="Utilisateur" onBack={goBack} />
        <ListRowSkeletons count={3} />
      </PageContainer>
    )
  }
  if (query.isError) {
    return (
      <PageContainer>
        <PageHeader title="Utilisateur" onBack={goBack} />
        <ErrorState onRetry={() => void query.refetch()} />
      </PageContainer>
    )
  }

  if (!user) {
    return (
      <PageContainer>
        <PageHeader title="Utilisateur introuvable" onBack={goBack} />
        <EmptyState
          icon={Users}
          title="Utilisateur introuvable"
          description="Ce compte n'existe pas ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  return <UtilisateurDetail userId={user.id} onBack={goBack} />
}
