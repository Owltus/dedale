import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import { investissementsQueries } from '@/features/investissements/queries'
import { InvestissementDetail } from '@/features/investissements/components/investissement-detail'
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

export const Route = createFileRoute('/_app/investissements/$investissement')({
  component: InvestissementDetailPage,
})

function InvestissementDetailPage() {
  const { investissement: slug } = Route.useParams()
  const { data: role } = useCurrentRole()
  // Édition = rôle métier (admin/manager/technicien), conforme à la RLS.
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Investissements (CapEx)"
        description="Suivi budgétaire des investissements par site."
        hint="Choisis un site pour voir ses investissements."
        icon={Wallet}
      />
    )
  }

  return (
    <InvestissementResolver
      siteId={activeSiteId}
      slug={slug}
      canManage={canManage}
    />
  )
}

function InvestissementResolver({
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
    investissementsQueries.list(siteId),
  )

  // Résolution slug -> investissement (MÊMES frères qu'à la génération du lien,
  // symétrie segOfUnique) AVEC repli par id : renommer l'investissement ouvert ne
  // l'éjecte plus vers « introuvable », l'URL se resynchronise sur le slug frais.
  const items = data ?? []
  const sibs = items.map((i) => ({ nom: i.libelle, id: i.id }))
  const investissement = useSlugResolved(
    items,
    slug,
    (i) => segOfUnique({ nom: i.libelle, id: i.id }, sibs),
    (freshSlug) =>
      void navigate({
        to: '/investissements/$investissement',
        params: { investissement: freshSlug },
        replace: true,
      }),
  )

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="Investissement" />
        <ListRowSkeletons count={3} />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Investissement" />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  if (!investissement) {
    return (
      <PageContainer>
        <PageHeader title="Investissement introuvable" />
        <EmptyState
          icon={Wallet}
          title="Investissement introuvable"
          description="Cet investissement n'existe pas ou n'est pas accessible."
          action={
            <Button asChild>
              <Link to="/investissements">Retour aux investissements</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <InvestissementDetail
      investissement={investissement}
      siteId={siteId}
      canManage={canManage}
    />
  )
}
