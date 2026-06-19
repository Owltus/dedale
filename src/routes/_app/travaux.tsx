import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout des Travaux : porte la garde de rôle (`requireNav`), partagée par la
 * liste (index) et le détail paramétré (`$travaux`) qui portent la navigation
 * par URL. Pur layout sans `component` → TanStack rend un `<Outlet/>` par défaut
 * → la route enfant s'affiche.
 */
export const Route = createFileRoute('/_app/travaux')({
  beforeLoad: ({ context }) => requireNav('/travaux', context.queryClient),
})
