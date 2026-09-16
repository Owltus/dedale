import { useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { travauxQueries } from '@/features/travaux/queries'
import { PAGE_META } from '@/features/travaux/page-meta'
import { TravauxDetail } from '@/features/travaux/components/travaux-detail'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'

export const Route = createFileRoute('/_app/travaux/$travaux')({
  component: TravauxDetailPage,
})

function TravauxDetailPage() {
  const { travaux: slug } = Route.useParams()
  const navigate = useNavigate()
  // Mémoïsé : la resynchronisation d'URL est un ÉVÉNEMENT, pas un effet de chaque
  // rendu (contrat de `useSlugResolved`).
  const onSlugChange = useCallback(
    (freshSlug: string) =>
      void navigate({
        to: '/travaux/$travaux',
        params: { travaux: freshSlug },
        replace: true,
      }),
    [navigate],
  )

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Édition et transitions = rôle métier (admin/manager/technicien), conforme RLS. */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={travauxQueries.list(siteId)}
          slug={slug}
          identity={(c) => ({ nom: c.titre, id: c.id })}
          onSlugChange={onSlugChange}
          title={PAGE_META.titre}
          onBack={() => void navigate({ to: '/travaux' })}
          notFound={{
            title: "Ce travaux n'existe plus",
            description:
              "Le lien est peut-être périmé, la fiche a été supprimée, ou elle n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
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
