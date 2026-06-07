import { createFileRoute } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import { requireNav } from '@/lib/nav-guard'
import { useSiteContext } from '@/lib/site-context'
import { Dashboard } from '@/features/dashboard/components/dashboard'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'

export const Route = createFileRoute('/_app/')({
  // Le demandeur n'a pas de tableau de bord : redirigé vers /demandes.
  beforeLoad: ({ context }) => requireNav('/', context.queryClient),
  component: HomePage,
})

function HomePage() {
  const { activeSiteId, activeSite } = useSiteContext()

  return (
    <PageContainer>
      <PageHeader
        title="Tableau de bord"
        description={
          activeSite
            ? `Vue d'ensemble de la maintenance — ${activeSite.nom}.`
            : "Vue d'ensemble de la maintenance."
        }
      />
      {activeSiteId ? (
        <Dashboard siteId={activeSiteId} />
      ) : (
        <EmptyState
          icon={Building2}
          title="Sélectionne un site"
          description="Choisis un site pour afficher son tableau de bord."
        />
      )}
    </PageContainer>
  )
}
