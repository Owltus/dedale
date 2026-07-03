import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { CalendarRange } from 'lucide-react'
import { PlanningContent } from '@/features/planning/components/planning-page'
import { useSiteContext } from '@/lib/site-context'
import { NoSiteSelected } from '@/components/common/no-site-selected'

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
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Planning"
        description="Charge prévisionnelle par famille de gammes et par semaine."
        hint="Choisis un site pour voir son planning."
        icon={CalendarRange}
      />
    )
  }

  return <PlanningContent siteId={activeSiteId} />
}
