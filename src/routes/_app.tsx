import { useState } from 'react'
import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { SiteProvider } from '@/lib/site-context'
import { AppSidebar, SidebarContent } from '@/components/common/app-sidebar'
import { MobileHeader } from '@/components/common/mobile-header'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

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
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <SiteProvider>
      <div className="flex h-screen">
        {/* Sidebar fixe (bureau, lg+) */}
        <AppSidebar />

        {/* Drawer mobile/tablette (< lg) */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" showCloseButton={false}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader onMenu={() => setDrawerOpen(true)} />
          <main className="min-w-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SiteProvider>
  )
}
