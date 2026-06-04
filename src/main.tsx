import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { AuthProvider, useAuth } from './auth'
import './index.css'

const queryClient = new QueryClient()

// L'auth est injectée à l'exécution via le `context` du RouterProvider (cf. InnerApp).
const router = createRouter({
  routeTree,
  context: { auth: undefined!, queryClient },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function InnerApp() {
  const auth = useAuth()

  // On attend la restauration de session avant de monter le routeur,
  // pour éviter une redirection vers /login au rechargement d'une page protégée.
  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    )
  }

  return <RouterProvider router={router} context={{ auth }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
