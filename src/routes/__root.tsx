import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { AuthState } from '../auth'
import { useDocumentTitle } from '@/hooks/use-document-title'

export interface RouterContext {
  auth: AuthState
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
})

function NotFound() {
  // Sans en-tête de page, personne ne pose le titre d'onglet : il restait celui
  // de la page précédente. Arriver sur « Page introuvable » depuis une fiche
  // laissait donc le nom de cette fiche dans l'onglet.
  useDocumentTitle('Page introuvable')
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold">Page introuvable</h1>
        <p className="text-sm text-muted-foreground">
          La page demandée n’existe pas.
        </p>
        <Link to="/" className="text-sm underline underline-offset-4">
          Retour à l’accueil
        </Link>
      </div>
    </div>
  )
}
