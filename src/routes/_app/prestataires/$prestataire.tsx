import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Truck } from 'lucide-react'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { PrestataireDetail } from '@/features/prestataires/components/prestataire-detail'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import * as perm from '@/lib/permissions'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'

export const Route = createFileRoute('/_app/prestataires/$prestataire')({
  component: PrestataireDetailPage,
})

function PrestataireDetailPage() {
  const { prestataire: slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: role } = useCurrentRole()
  // Gestion métier (manager + technicien, conforme migration 053), miroir de la
  // RLS — la liste des prestataires applique déjà la même règle.
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  const goBack = () => void navigate({ to: '/prestataires' })

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Prestataires"
        description="Prestataires et contrats par site."
        hint="Choisis un site pour voir ses prestataires et contrats."
        icon={Truck}
      />
    )
  }

  return (
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
        description: "Ce prestataire n'existe pas ou n'est pas accessible.",
        icon: Truck,
        showBack: true,
      }}
    >
      {(prestataire) => (
        <PrestataireDetail
          prestataire={prestataire}
          siteId={activeSiteId}
          canManage={canManage}
          onBack={goBack}
        />
      )}
    </SlugDetailRoute>
  )
}
