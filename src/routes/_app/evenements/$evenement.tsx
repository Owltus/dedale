import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { evenementsQueries } from '@/features/evenements/queries'
import { PAGE_META } from '@/features/evenements/page-meta'
import { EvenementDetail } from '@/features/evenements/components/evenement-detail'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/evenements/$evenement')({
  component: EvenementDetailPage,
})

function EvenementDetailPage() {
  const { evenement: slug } = Route.useParams()
  const navigate = useNavigate()

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Consigner, éditer et clôturer = rôle métier (conforme RLS 077). */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={evenementsQueries.list(siteId)}
          slug={slug}
          identity={(e) => ({ nom: e.titre, id: e.id })}
          onSlugChange={(freshSlug) =>
            void navigate({
              to: '/evenements/$evenement',
              params: { evenement: freshSlug },
              replace: true,
            })
          }
          title={PAGE_META.titre}
          onBack={() => void navigate({ to: '/evenements' })}
          notFound={{
            title: 'Événement introuvable',
            description:
              "Cet événement n'existe plus ou n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
            action: (
              <Button asChild>
                <Link to="/evenements">Retour aux événements</Link>
              </Button>
            ),
          }}
        >
          {(evenement) => (
            <EvenementDetail
              evenement={evenement}
              canManage={canManage}
              onBack={() => void navigate({ to: '/evenements' })}
            />
          )}
        </SlugDetailRoute>
      )}
    </SiteScopedRoute>
  )
}
