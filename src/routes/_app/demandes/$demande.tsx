import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { demandesQueries } from '@/features/demandes/queries'
import { DiDetail } from '@/features/demandes/components/di-detail'
import { diTitre } from '@/features/demandes/schemas'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSlugResolved } from '@/hooks/use-slug-resolved'
import { useSiteContext } from '@/lib/site-context'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/demandes/$demande')({
  component: DemandeDetailPage,
})

function DemandeDetailPage() {
  const { demande: slug } = Route.useParams()
  const { data: role } = useCurrentRole()
  // Résolution/réouverture : rôles ayant accès opérationnel au site (RLS arbitre).
  const canResolve = perm.canResolveDemande(role)
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
    <DemandeResolver
      siteId={activeSiteId}
      slug={slug}
      canResolve={canResolve}
    />
  )
}

function DemandeResolver({
  siteId,
  slug,
  canResolve,
}: {
  siteId: string
  slug: string
  canResolve: boolean
}) {
  const navigate = useNavigate()
  const { data, isPending, isError, refetch } = useQuery(
    demandesQueries.list(siteId),
  )

  // Résolution par slug (titre dérivé du constat) AVEC repli par id : le slug se
  // resynchronise au lieu d'éjecter vers « introuvable » si le constat évolue.
  const items = data ?? []
  const sibs = items.map((d) => ({ nom: diTitre(d.constat), id: d.id }))
  const demande = useSlugResolved(
    items,
    slug,
    (d) => segOfUnique({ nom: diTitre(d.constat), id: d.id }, sibs),
    (freshSlug) =>
      void navigate({
        to: '/demandes/$demande',
        params: { demande: freshSlug },
        replace: true,
      }),
  )

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader
          title="Demande d'intervention"
          onBack={() => void navigate({ to: '/demandes' })}
        />
        <ListRowSkeletons count={3} />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader
          title="Demande d'intervention"
          onBack={() => void navigate({ to: '/demandes' })}
        />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  if (!demande) {
    return (
      <PageContainer>
        <PageHeader title="Demande introuvable" />
        <EmptyState
          icon={ClipboardList}
          title="Demande introuvable"
          description="Cette demande n'existe plus ou ne t'est pas accessible."
          action={
            <Button asChild>
              <Link to="/demandes">Retour aux demandes</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return <DiDetail demande={demande} canResolve={canResolve} />
}
