import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { investissementsQueries } from '@/features/investissements/queries'
import { PAGE_META } from '@/features/investissements/page-meta'
import { InvestissementDetail } from '@/features/investissements/components/investissement-detail'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/investissements/$investissement')({
  component: InvestissementDetailPage,
})

function InvestissementDetailPage() {
  const { investissement: slug } = Route.useParams()
  const navigate = useNavigate()

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Édition = rôle métier (admin/manager/technicien), conforme à la RLS. */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={investissementsQueries.list(siteId)}
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
            description:
              "Cet investissement n'existe pas ou n'est pas accessible.",
            icon: PAGE_META.icone,
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
              siteId={siteId}
              canManage={canManage}
            />
          )}
        </SlugDetailRoute>
      )}
    </SiteScopedRoute>
  )
}
