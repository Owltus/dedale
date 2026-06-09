import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { AuthProvider, useAuth } from './auth'
import { ThemeProvider } from './components/theme'
import { Toaster } from './components/ui/sonner'
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
      <div className="text-muted-foreground flex min-h-screen flex-col items-center justify-center gap-6">
        <img
          src="/logo.svg"
          alt="Logo Dédale"
          className="size-32 shrink-0 animate-pulse dark:invert"
        />
        <div className="text-center leading-tight">
          <p className="text-foreground text-xl font-bold tracking-wide uppercase">
            Dédale
          </p>
          <p className="text-muted-foreground text-xs">Gestion de Maintenance</p>
        </div>
      </div>
    )
  }

  return <RouterProvider router={router} context={{ auth }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <InnerApp />
        </AuthProvider>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
