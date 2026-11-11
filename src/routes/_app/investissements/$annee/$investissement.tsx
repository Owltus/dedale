import { useCallback } from 'react'
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { investissementsQueries } from '@/features/investissements/queries'
import { PAGE_META } from '@/features/investissements/page-meta'
import { anneeDeParam } from '@/features/investissements/annee'
import { InvestissementDetail } from '@/features/investissements/components/investissement-detail'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'

export const Route = createFileRoute(
  '/_app/investissements/$annee/$investissement',
)({
  component: InvestissementDetailPage,
})

function InvestissementDetailPage() {
  const { annee: param, investissement: slug } = Route.useParams()
  const annee = anneeDeParam(param)
  const navigate = useNavigate()
  // Mémoïsé : la resynchronisation d'URL est un ÉVÉNEMENT, pas un effet de chaque
  // rendu (contrat de `useSlugResolved`).
  const onSlugChange = useCallback(
    (freshSlug: string) =>
      void navigate({
        to: '/investissements/$annee/$investissement',
        params: { annee: param, investissement: freshSlug },
        replace: true,
      }),
    [navigate, param],
  )

  if (annee === null) return <Navigate to="/investissements" replace />
  const retour = () =>
    void navigate({
      to: '/investissements/$annee',
      params: { annee: String(annee) },
    })

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Édition = rôle métier (admin/manager/technicien), conforme à la RLS. */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          // Résolu sur l'année : même ensemble que la liste de l'année.
          options={investissementsQueries.parAnnee(siteId, annee)}
          slug={slug}
          identity={(i) => ({ nom: i.libelle, id: i.id })}
          onSlugChange={onSlugChange}
          title="Projet"
          onBack={retour}
          notFound={{
            title: "Ce projet n'est pas dans ce budget",
            description:
              "Il a peut-être été reporté à une autre année, supprimé, ou il n'est pas accessible depuis ce site.",
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
