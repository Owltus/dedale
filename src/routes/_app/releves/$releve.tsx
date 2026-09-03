import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { relevesQueries } from '@/features/releves/queries'
import { PAGE_META } from '@/features/releves/page-meta'
import { ReleveDetail } from '@/features/releves/components/releve-detail'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'

export const Route = createFileRoute('/_app/releves/$releve')({
  component: ReleveDetailPage,
})

function ReleveDetailPage() {
  const { releve: slug } = Route.useParams()
  const navigate = useNavigate()
  const goBack = () => void navigate({ to: '/releves' })

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => (
        <SlugDetailRoute
          options={relevesQueries.gammesListe(siteId)}
          slug={slug}
          identity={(g) => ({ nom: g.nomGamme, id: g.id })}
          onSlugChange={(freshSlug) =>
            void navigate({
              to: '/releves/$releve',
              params: { releve: freshSlug },
              replace: true,
            })
          }
          title="Relevés"
          onBack={goBack}
          notFound={{
            title: 'Gamme introuvable',
            description:
              "Cette gamme n'a plus de relevé, ou n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
            showBack: true,
          }}
        >
          {(gamme) => (
            <ReleveDetail gamme={gamme} siteId={siteId} onBack={goBack} />
          )}
        </SlugDetailRoute>
      )}
    </SiteScopedRoute>
  )
}
