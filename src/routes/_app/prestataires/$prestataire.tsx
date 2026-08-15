import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { PAGE_META } from '@/features/prestataires/page-meta'
import { PrestataireDetail } from '@/features/prestataires/components/prestataire-detail'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'

export const Route = createFileRoute('/_app/prestataires/$prestataire')({
  component: PrestataireDetailPage,
})

function PrestataireDetailPage() {
  const { prestataire: slug } = Route.useParams()
  const navigate = useNavigate()

  const goBack = () => void navigate({ to: '/prestataires' })

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Gestion métier (manager + technicien, conforme migration 053), miroir
          de la RLS — la liste des prestataires applique déjà la même règle. */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={prestatairesQueries.list()}
          slug={slug}
          identity={(p) => ({ nom: p.libelle, id: p.id })}
          onSlugChange={(freshSlug) =>
            void navigate({
              to: '/prestataires/$prestataire',
              params: { prestataire: freshSlug },
              replace: true,
            })
          }
          title="Prestataire"
          onBack={goBack}
          notFound={{
            title: 'Prestataire introuvable',
            description:
              "Ce prestataire n'existe plus ou n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
            showBack: true,
          }}
        >
          {(prestataire) => (
            <PrestataireDetail
              prestataire={prestataire}
              siteId={siteId}
              canManage={canManage}
              onBack={goBack}
            />
          )}
        </SlugDetailRoute>
      )}
    </SiteScopedRoute>
  )
}
