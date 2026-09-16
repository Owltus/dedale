import { useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { investissementsQueries } from '@/features/investissements/queries'
import { PAGE_META } from '@/features/investissements/page-meta'
import { InvestissementDetail } from '@/features/investissements/components/investissement-detail'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'

export const Route = createFileRoute('/_app/investissements/$investissement')({
  component: InvestissementDetailPage,
})

function InvestissementDetailPage() {
  const { investissement: slug } = Route.useParams()
  const navigate = useNavigate()
  // Mémoïsé : la resynchronisation d'URL est un ÉVÉNEMENT, pas un effet de chaque
  // rendu (contrat de `useSlugResolved`).
  const onSlugChange = useCallback(
    (freshSlug: string) =>
      void navigate({
        to: '/investissements/$investissement',
        params: { investissement: freshSlug },
        replace: true,
      }),
    [navigate],
  )

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Édition = rôle métier (admin/manager/technicien), conforme à la RLS. */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={investissementsQueries.list(siteId)}
          slug={slug}
          identity={(i) => ({ nom: i.libelle, id: i.id })}
          onSlugChange={onSlugChange}
          title="Investissement"
          onBack={() => void navigate({ to: '/investissements' })}
          notFound={{
            title: "Cet investissement n'existe plus",
            description:
              "Le lien est peut-être périmé, l'investissement a été supprimé, ou il n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
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
