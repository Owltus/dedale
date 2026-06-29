import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Truck } from 'lucide-react'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { PrestataireDetail } from '@/features/prestataires/components/prestataire-detail'
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

export const Route = createFileRoute('/_app/prestataires/$prestataire')({
  component: PrestataireDetailPage,
})

function PrestataireDetailPage() {
  const { prestataire: slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: role } = useCurrentRole()
  // Gestion métier (manager + technicien, conforme migration 053), miroir de la
  // RLS — la liste des prestataires applique déjà la même règle.
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()
  const {
    data: prestataires,
    isPending,
    isError,
    refetch,
  } = useQuery(prestatairesQueries.list())

  const goBack = () => void navigate({ to: '/prestataires' })

  // Résolution par slug AVEC repli par id : renommer le prestataire ouvert ne
  // l'éjecte plus vers « introuvable », l'URL se resynchronise sur le slug frais.
  const items = prestataires ?? []
  const sibs = items.map((p) => ({ nom: p.libelle, id: p.id }))
  const prestataire = useSlugResolved(
    items,
    slug,
    (p) => segOfUnique({ nom: p.libelle, id: p.id }, sibs),
    (freshSlug) =>
      void navigate({
        to: '/prestataires/$prestataire',
        params: { prestataire: freshSlug },
        replace: true,
      }),
  )

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Prestataires"
        description="Prestataires et contrats par site."
        hint="Choisis un site pour voir ses prestataires et contrats."
        icon={Truck}
      />
    )
  }

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="Prestataire" onBack={goBack} />
        <ListRowSkeletons count={3} />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Prestataire" onBack={goBack} />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  if (!prestataire) {
    return (
      <PageContainer>
        <PageHeader title="Prestataire introuvable" onBack={goBack} />
        <EmptyState
          icon={Truck}
          title="Prestataire introuvable"
          description="Ce prestataire n'existe pas ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  return (
    <PrestataireDetail
      prestataire={prestataire}
      siteId={activeSiteId}
      canManage={canManage}
      onBack={goBack}
    />
  )
}
