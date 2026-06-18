import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import { investissementsQueries } from '@/features/investissements/queries'
import { InvestissementDetail } from '@/features/investissements/components/investissement-detail'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'

export const Route = createFileRoute('/_app/investissements/$investissement')({
  component: InvestissementDetailPage,
})

function InvestissementDetailPage() {
  const { investissement: slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageAdmin(role)
  const { activeSiteId } = useSiteContext()

  const goBack = () => void navigate({ to: '/investissements' })

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
      onBack={goBack}
    />
  )
}

function InvestissementResolver({
  siteId,
  slug,
  canManage,
  onBack,
}: {
  siteId: string
  slug: string
  canManage: boolean
  onBack: () => void
}) {
  const { data, isPending, isError, refetch } = useQuery(
    investissementsQueries.list(siteId),
  )

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="Investissement" onBack={onBack} />
        <ListRowSkeletons count={3} />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Investissement" onBack={onBack} />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  // Résolution slug -> investissement avec le MÊME ensemble de frères qu'à la
  // génération du lien (symétrie segOfUnique).
  const sibs = data.map((i) => ({ nom: i.libelle, id: i.id }))
  const investissement =
    data.find(
      (i) => segOfUnique({ nom: i.libelle, id: i.id }, sibs) === slug,
    ) ?? null

  if (!investissement) {
    return (
      <PageContainer>
        <PageHeader title="Investissement introuvable" onBack={onBack} />
        <EmptyState
          icon={Wallet}
          title="Investissement introuvable"
          description="Cet investissement n'existe pas ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  return (
    <InvestissementDetail
      investissement={investissement}
      siteId={siteId}
      canManage={canManage}
      onBack={onBack}
    />
  )
}
