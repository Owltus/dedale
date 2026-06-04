import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { AuthState } from '../auth'

export interface RouterContext {
  auth: AuthState
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground text-sm">
        La page demandée n’existe pas.
      </p>
      <Link to="/" className="text-sm underline underline-offset-4">
        Retour à l’accueil
      </Link>
    </div>
  )
}
