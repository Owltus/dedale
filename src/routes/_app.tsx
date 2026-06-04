import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { SiteProvider } from '@/lib/site-context'
import { AppSidebar } from '@/components/common/app-sidebar'

export const Route = createFileRoute('/_app')({
  // Garde d'authentification factorisée pour tous les écrans de l'app.
  beforeLoad: ({ context }) => {
    if (!context.auth.session) {
      throw redirect({ to: '/login' })
    }
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <SiteProvider>
      <div className="flex h-screen">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </SiteProvider>
  )
}
