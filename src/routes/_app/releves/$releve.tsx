import { useCallback } from 'react'
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
  // Mémoïsé : la resynchronisation d'URL est un ÉVÉNEMENT, pas un effet de chaque
  // rendu (contrat de `useSlugResolved`).
  const onSlugChange = useCallback(
    (freshSlug: string) =>
      void navigate({
        to: '/releves/$releve',
        params: { releve: freshSlug },
        replace: true,
      }),
    [navigate],
  )

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => (
        <SlugDetailRoute
          options={relevesQueries.gammesListe(siteId)}
          slug={slug}
          identity={(g) => ({ nom: g.nomGamme, id: g.id })}
          onSlugChange={onSlugChange}
          title="Relevés"
          onBack={goBack}
          notFound={{
            title: "Cette gamme n'a plus de relevé",
            description:
              "Le lien est peut-être périmé, la gamme a été supprimée, ou elle n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
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
