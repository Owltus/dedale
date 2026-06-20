import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HardHat } from 'lucide-react'
import { travauxQueries } from '@/features/travaux/queries'
import { TravauxDetail } from '@/features/travaux/components/travaux-detail'
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

export const Route = createFileRoute('/_app/travaux/$travaux')({
  component: TravauxDetailPage,
})

function TravauxDetailPage() {
  const { travaux: slug } = Route.useParams()
  const { data: role } = useCurrentRole()
  // Édition/transitions = rôle métier (admin/manager/technicien), conforme RLS.
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Travaux"
        description="Travaux ponctuels du site."
        hint="Choisis un site pour voir ses travaux."
        icon={HardHat}
      />
    )
  }

  return (
    <TravauxResolver siteId={activeSiteId} slug={slug} canManage={canManage} />
  )
}

function TravauxResolver({
  siteId,
  slug,
  canManage,
}: {
  siteId: string
  slug: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const { data, isPending, isError, refetch } = useQuery(
    travauxQueries.list(siteId),
  )

  // Résolution slug -> travaux (MÊMES frères qu'à la génération du lien, symétrie
  // segOfUnique) AVEC repli par id : renommer le travaux ouvert ne l'éjecte plus
  // vers « introuvable », l'URL se resynchronise sur le slug frais.
  const items = data ?? []
  const sibs = items.map((c) => ({ nom: c.titre, id: c.id }))
  const travaux = useSlugResolved(
    items,
    slug,
    (c) => segOfUnique({ nom: c.titre, id: c.id }, sibs),
    (freshSlug) =>
      void navigate({
        to: '/travaux/$travaux',
        params: { travaux: freshSlug },
        replace: true,
      }),
  )

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="Travaux" />
        <ListRowSkeletons count={3} />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Travaux" />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  if (!travaux) {
    return (
      <PageContainer>
        <PageHeader title="Travaux introuvable" />
        <EmptyState
          icon={HardHat}
          title="Travaux introuvable"
          description="Ce travaux n'existe plus ou n'est pas accessible."
          action={
            <Button asChild>
              <Link to="/travaux">Retour aux travaux</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <TravauxDetail travaux={travaux} siteId={siteId} canManage={canManage} />
  )
}
