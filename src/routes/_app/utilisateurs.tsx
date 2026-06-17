import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout des Utilisateurs : porte la garde de rôle (`requireNav`), partagée par
 * la liste (index) et le détail paramétré (`$utilisateur`, slug du nom) qui
 * portent la navigation par URL. Pur layout sans `component` → TanStack rend un
 * `<Outlet/>` par défaut.
 */
export const Route = createFileRoute('/_app/utilisateurs')({
  beforeLoad: ({ context }) => requireNav('/utilisateurs', context.queryClient),
})
