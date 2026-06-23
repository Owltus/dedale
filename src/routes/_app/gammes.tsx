import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout du Plan de maintenance : porte la garde de rôle (`requireNav`), partagée
 * par la liste (index) et le détail paramétré (`$gamme`) qui portent la navigation
 * par URL. Pur layout sans `component` → TanStack rend un `<Outlet/>` par défaut →
 * la route enfant s'affiche.
 */
export const Route = createFileRoute('/_app/gammes')({
  beforeLoad: ({ context }) => requireNav('/gammes', context.queryClient),
})
