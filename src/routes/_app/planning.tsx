import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { PlanningContent } from '@/features/planning/components/planning-page'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/planning/page-meta'

export const Route = createFileRoute('/_app/planning')({
  beforeLoad: ({ context }) => requireNav('/planning', context.queryClient),
  component: PlanningPage,
})

/**
 * Route mince : porte la garde de rôle (`requireNav`) et le garde-fou « aucun site »
 * (calque `/gammes`). Tout le corps — grille famille × semaine, fenêtre temporelle,
 * requêtes, modale de cellule — vit dans `PlanningContent`.
 */
function PlanningPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => <PlanningContent siteId={siteId} />}
    </SiteScopedRoute>
  )
}
