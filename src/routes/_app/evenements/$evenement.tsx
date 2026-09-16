import { useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { evenementsQueries } from '@/features/evenements/queries'
import { PAGE_META } from '@/features/evenements/page-meta'
import { EvenementDetail } from '@/features/evenements/components/evenement-detail'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'

export const Route = createFileRoute('/_app/evenements/$evenement')({
  component: EvenementDetailPage,
})

function EvenementDetailPage() {
  const { evenement: slug } = Route.useParams()
  const navigate = useNavigate()
  // Mémoïsé : la resynchronisation d'URL est un ÉVÉNEMENT, pas un effet de chaque
  // rendu (contrat de `useSlugResolved`).
  const onSlugChange = useCallback(
    (freshSlug: string) =>
      void navigate({
        to: '/evenements/$evenement',
        params: { evenement: freshSlug },
        replace: true,
      }),
    [navigate],
  )

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Consigner, éditer et clôturer = rôle métier (conforme RLS 077). */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={evenementsQueries.list(siteId)}
          slug={slug}
          identity={(e) => ({ nom: e.titre, id: e.id })}
          onSlugChange={onSlugChange}
          title={PAGE_META.titre}
          onBack={() => void navigate({ to: '/evenements' })}
          notFound={{
            title: "Cet événement n'existe plus",
            description:
              "Le lien est peut-être périmé, l'événement a été supprimé, ou il n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
          }}
        >
          {(evenement) => (
            <EvenementDetail evenement={evenement} canManage={canManage} />
          )}
        </SlugDetailRoute>
      )}
    </SiteScopedRoute>
  )
}
