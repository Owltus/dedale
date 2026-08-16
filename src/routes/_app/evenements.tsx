import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout des Événements : porte la garde de rôle (`requireNav`), partagée par la
 * liste (index) et le détail paramétré (`$evenement`). Pur layout sans
 * `component` → TanStack rend un `<Outlet/>` → la route enfant s'affiche.
 */
export const Route = createFileRoute('/_app/evenements')({
  beforeLoad: ({ context }) => requireNav('/evenements', context.queryClient),
})
