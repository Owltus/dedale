import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { travauxQueries } from '@/features/travaux/queries'
import { PAGE_META } from '@/features/travaux/page-meta'
import { TravauxDetail } from '@/features/travaux/components/travaux-detail'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/travaux/$travaux')({
  component: TravauxDetailPage,
})

function TravauxDetailPage() {
  const { travaux: slug } = Route.useParams()
  const navigate = useNavigate()

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Édition et transitions = rôle métier (admin/manager/technicien), conforme RLS. */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={travauxQueries.list(siteId)}
          slug={slug}
          identity={(c) => ({ nom: c.titre, id: c.id })}
          onSlugChange={(freshSlug) =>
            void navigate({
              to: '/travaux/$travaux',
              params: { travaux: freshSlug },
              replace: true,
            })
          }
          title={PAGE_META.titre}
          onBack={() => void navigate({ to: '/travaux' })}
          notFound={{
            title: 'Travaux introuvable',
            description:
              "Ce travaux n'existe plus ou n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
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
              siteId={siteId}
              canManage={canManage}
            />
          )}
        </SlugDetailRoute>
      )}
    </SiteScopedRoute>
  )
}
