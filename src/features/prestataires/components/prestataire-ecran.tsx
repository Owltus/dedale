import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { PAGE_META } from '@/features/prestataires/page-meta'
import {
  PrestataireDetail,
  type GammesPanelInjecte,
} from '@/features/prestataires/components/prestataire-detail'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'

// Via `getRouteApi` pour ne PAS inverser la dépendance features → routes.
const Route = getRouteApi('/_app/prestataires/$prestataire')

export function PrestataireEcran({
  GammesPanel,
}: {
  /** Onglet Gammes de la fiche, injecté par la route. */
  GammesPanel: GammesPanelInjecte
}) {
  const { prestataire: slug } = Route.useParams()
  const navigate = useNavigate()

  const goBack = () => void navigate({ to: '/prestataires' })
  // Mémoïsé par React Compiler : la resynchronisation d'URL est un ÉVÉNEMENT, pas
  // un effet de chaque rendu (contrat de `useSlugResolved`).
  const onSlugChange = (freshSlug: string) =>
    void navigate({
      to: '/prestataires/$prestataire',
      params: { prestataire: freshSlug },
      replace: true,
    })

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Gestion métier (manager + technicien, conforme migration 053), miroir
          de la RLS — la liste des prestataires applique déjà la même règle. */}
      {({ siteId, canManage }) => (
        <SlugDetailRoute
          options={prestatairesQueries.list()}
          slug={slug}
          identity={(p) => ({ nom: p.libelle, id: p.id })}
          onSlugChange={onSlugChange}
          title="Prestataire"
          onBack={goBack}
          notFound={{
            title: "Ce prestataire n'existe plus",
            description:
              "Le lien est peut-être périmé, la fiche a été supprimée, ou elle n'est pas accessible depuis ce site.",
            icon: PAGE_META.icone,
          }}
        >
          {(prestataire) => (
            <PrestataireDetail
              prestataire={prestataire}
              siteId={siteId}
              canManage={canManage}
              onBack={goBack}
              GammesPanel={GammesPanel}
            />
          )}
        </SlugDetailRoute>
      )}
    </SiteScopedRoute>
  )
}
