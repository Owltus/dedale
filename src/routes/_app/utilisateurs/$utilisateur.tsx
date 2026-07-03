import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ShieldOff, Users } from 'lucide-react'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { UtilisateurDetail } from '@/features/utilisateurs/components/utilisateur-detail'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
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

  return (
    <SlugDetailRoute
      options={{ ...utilisateursQueries.list(), enabled: canManage }}
      slug={slug}
      identity={(u) => ({ nom: u.nom_complet, id: u.id })}
      // Soi-même exclu des deux côtés (comme la liste) — repli par id inclus.
      filterItems={(items) => items.filter((u) => u.id !== session?.user.id)}
      onSlugChange={(freshSlug) =>
        void navigate({
          to: '/utilisateurs/$utilisateur',
          params: { utilisateur: freshSlug },
          replace: true,
        })
      }
      title="Utilisateur"
      onBack={goBack}
      notFound={{
        title: 'Utilisateur introuvable',
        description: "Ce compte n'existe pas ou n'est pas accessible.",
        icon: Users,
        showBack: true,
      }}
    >
      {(user) => <UtilisateurDetail userId={user.id} onBack={goBack} />}
    </SlugDetailRoute>
  )
}
