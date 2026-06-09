import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { ScopeProvider } from '@/components/common/scope-provider'
import { PageContainer } from '@/components/common/page-container'
import { Tabs, type TabItem } from '@/components/common/tabs'
import { CategoriesPanel } from '@/features/categories/components/categories-panel'
import { ModelesEquipementsPanel } from '@/features/modeles-equipements/components/modeles-equipements-panel'
import { GammesTypesPanel } from '@/features/modeles-operations/components/gammes-types-panel'
import { ModelesDiPanel } from '@/features/modeles-di/components/modeles-di-panel'
import { MiniaturesPanel } from '@/features/miniatures/components/miniatures-panel'
import { useCurrentRole } from '@/hooks/use-current-role'
import * as perm from '@/lib/permissions'

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
  const { data: role } = useCurrentRole()
  // Les modèles de DI sont à scope SITE strict : sans intérêt pour les rôles
  // entreprise (admin/manager) qui raisonnent au niveau entreprise. Onglet
  // réservé aux rôles qui gèrent concrètement un site (technicien).
  const showDi = !perm.canManageAdmin(role)

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
      label: 'Modèles de gammes',
      content: <GammesTypesPanel />,
    },
    ...(showDi
      ? [
          {
            id: 'modeles-di',
            label: 'Modèles de DI',
            content: <ModelesDiPanel />,
          },
        ]
      : []),
    {
      id: 'vignettes',
      label: 'Vignettes',
      content: <MiniaturesPanel />,
    },
  ]

  return (
    <PageContainer fill>
      <ScopeProvider>
        <Tabs title="Bibliothèque" items={tabs} />
      </ScopeProvider>
    </PageContainer>
  )
}
