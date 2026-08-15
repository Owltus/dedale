import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useSiteContext } from '@/lib/site-context'
import { Dashboard } from '@/features/dashboard/components/dashboard'
import { PAGE_META } from '@/features/dashboard/page-meta'
import {
  PageContainer,
  FillHeader,
  ScrollBody,
} from '@/components/common/page-container'
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
    // Mode `fill` : on maîtrise nous-mêmes en-tête fixe + corps, pour que le tableau de
    // bord soit un conteneur flex de HAUTEUR DÉFINIE (via la chaîne flex de l'app-shell,
    // sans hauteur en pourcentage). Le `ScrollBody` en `flex flex-col` donne au tableau
    // une hauteur bornée à la fenêtre → sa zone de cartes rétrécit pour tout faire tenir
    // (zéro scrollbar tant que ça rentre ; le corps ne défile qu'en dernier recours).
    <PageContainer fill>
      <FillHeader>
        <PageHeader
          title={PAGE_META.titre}
          description={
            activeSite
              ? `Vue d'ensemble de la maintenance — ${activeSite.nom}.`
              : PAGE_META.description
          }
        />
      </FillHeader>
      {activeSiteId ? (
        // Colonne flex de hauteur définie (`min-h-0 flex-1`) qui DÉFILE (`overflow-y-auto`).
        // Le tableau la remplit quand il y a la place (cartes dynamiques), mais garde un
        // PLANCHER de ~8 lignes par carte : si la fenêtre est trop basse, le tableau
        // dépasse et c'est CE conteneur qui reprend la scrollbar (fill-or-scroll). `pb-6` =
        // marge du bas.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8">
          <Dashboard siteId={activeSiteId} />
        </div>
      ) : (
        <ScrollBody className="pt-6">
          <EmptyState
            // Icône de la PAGE, pas Building2 qui est celle de la page Sites.
            icon={PAGE_META.icone}
            title="Sélectionne un site"
            description={PAGE_META.hint}
          />
        </ScrollBody>
      )}
    </PageContainer>
  )
}
