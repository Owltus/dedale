import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { PageContainer } from '@/components/common/page-container'
import { Tabs, type TabItem } from '@/components/common/tabs'
import { CategoriesPanel } from '@/features/categories/components/categories-panel'
import { ModelesEquipementsPanel } from '@/features/modeles-equipements/components/modeles-equipements-panel'
import { GammesTypesPanel } from '@/features/modeles-operations/components/gammes-types-panel'
import { ModelesDiPanel } from '@/features/modeles-di/components/modeles-di-panel'
import { MiniaturesPanel } from '@/features/miniatures/components/miniatures-panel'

/**
 * Bibliothèque : page unique du catalogue, divisée en onglets. Catalogue
 * partagé entreprise/site, visible aux rôles métier (les techs lisent
 * l'entreprise et écrivent sur leurs sites — la RLS arbitre).
 */
export const Route = createFileRoute('/_app/bibliotheque')({
  beforeLoad: ({ context }) => requireNav('/bibliotheque', context.queryClient),
  component: BibliothequePage,
})

function BibliothequePage() {
  const tabs: TabItem[] = [
    {
      id: 'categories',
      label: 'Domaines & familles',
      content: <CategoriesPanel />,
    },
    {
      id: 'modeles-equipements',
      label: "Modèles d'équipements",
      content: <ModelesEquipementsPanel />,
    },
    {
      id: 'gammes-types',
      label: 'Gammes-types',
      content: <GammesTypesPanel />,
    },
    {
      id: 'modeles-di',
      label: 'Modèles de DI',
      content: <ModelesDiPanel />,
    },
    {
      id: 'vignettes',
      label: 'Vignettes',
      content: <MiniaturesPanel />,
    },
  ]

  return (
    <PageContainer fill>
      <Tabs title="Bibliothèque" items={tabs} />
    </PageContainer>
  )
}
