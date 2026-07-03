import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { HardHat } from 'lucide-react'
import { travauxQueries } from '@/features/travaux/queries'
import { TravauxDetail } from '@/features/travaux/components/travaux-detail'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import * as perm from '@/lib/permissions'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/travaux/$travaux')({
  component: TravauxDetailPage,
})

function TravauxDetailPage() {
  const { travaux: slug } = Route.useParams()
  const navigate = useNavigate()
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
    <SlugDetailRoute
      options={travauxQueries.list(activeSiteId)}
      slug={slug}
      identity={(c) => ({ nom: c.titre, id: c.id })}
      onSlugChange={(freshSlug) =>
        void navigate({
          to: '/travaux/$travaux',
          params: { travaux: freshSlug },
          replace: true,
        })
      }
      title="Travaux"
      onBack={() => void navigate({ to: '/travaux' })}
      notFound={{
        title: 'Travaux introuvable',
        description: "Ce travaux n'existe plus ou n'est pas accessible.",
        icon: HardHat,
        action: (
          <Button asChild>
            <Link to="/travaux">Retour aux travaux</Link>
          </Button>
        ),
      }}
    >
      {(travaux) => (
        <TravauxDetail
          travaux={travaux}
          siteId={activeSiteId}
          canManage={canManage}
        />
      )}
    </SlugDetailRoute>
  )
}
