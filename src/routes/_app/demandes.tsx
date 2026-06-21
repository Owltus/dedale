import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout des Demandes d'intervention : porte la garde de rôle (`requireNav`),
 * partagée par la liste (index) et le détail paramétré (`$demande`) qui portent
 * la navigation par URL. La clé `/demandes` est visible par TOUS les rôles
 * (`NAV_ROLES = 'tous'`, espace de travail du demandeur) → la garde ne redirige
 * personne ; elle aligne juste le patron. Pur layout sans `component` → TanStack
 * rend un `<Outlet/>` par défaut → la route enfant s'affiche.
 */
export const Route = createFileRoute('/_app/demandes')({
  beforeLoad: ({ context }) => requireNav('/demandes', context.queryClient),
})
