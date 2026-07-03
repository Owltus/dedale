import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { investissementsQueries } from '@/features/investissements/queries'
import { InvestissementDetail } from '@/features/investissements/components/investissement-detail'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import * as perm from '@/lib/permissions'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/investissements/$investissement')({
  component: InvestissementDetailPage,
})

function InvestissementDetailPage() {
  const { investissement: slug } = Route.useParams()
  const navigate = useNavigate()
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
    <SlugDetailRoute
      options={investissementsQueries.list(activeSiteId)}
      slug={slug}
      identity={(i) => ({ nom: i.libelle, id: i.id })}
      onSlugChange={(freshSlug) =>
        void navigate({
          to: '/investissements/$investissement',
          params: { investissement: freshSlug },
          replace: true,
        })
      }
      title="Investissement"
      onBack={() => void navigate({ to: '/investissements' })}
      notFound={{
        title: 'Investissement introuvable',
        description: "Cet investissement n'existe pas ou n'est pas accessible.",
        icon: Wallet,
        action: (
          <Button asChild>
            <Link to="/investissements">Retour aux investissements</Link>
          </Button>
        ),
      }}
    >
      {(investissement) => (
        <InvestissementDetail
          investissement={investissement}
          siteId={activeSiteId}
          canManage={canManage}
        />
      )}
    </SlugDetailRoute>
  )
}
