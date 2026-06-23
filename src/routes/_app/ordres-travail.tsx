import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout des Ordres de travail : porte la garde de rôle (`requireNav`), partagée
 * par la liste (index) et le détail paramétré (`$otId`). Pur layout sans
 * `component` → TanStack rend un `<Outlet/>` par défaut → la route enfant
 * s'affiche.
 */
export const Route = createFileRoute('/_app/ordres-travail')({
  beforeLoad: ({ context }) =>
    requireNav('/ordres-travail', context.queryClient),
})
