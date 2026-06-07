import { useEffect, useRef, useState } from 'react'
import {
  createFileRoute,
  redirect,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import {
  currentRoleQueryOptions,
  useCurrentRole,
} from '@/hooks/use-current-role'
import { sitesQueries } from '@/features/sites/queries'
import { SiteProvider, useSiteContext } from '@/lib/site-context'
import * as perm from '@/lib/permissions'
import { AppSidebar, SidebarContent } from '@/components/common/app-sidebar'
import { MobileHeader } from '@/components/common/mobile-header'
import { TopBar } from '@/components/common/top-bar'
import { PageContainer } from '@/components/common/page-container'
import { EmptyState } from '@/components/common/empty-state'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/use-media-query'

export const Route = createFileRoute('/_app')({
  // Garde d'authentification factorisée pour tous les écrans de l'app.
  beforeLoad: async ({ context }) => {
    if (!context.auth.session) {
      throw redirect({ to: '/login' })
    }
    // Pré-résout rôle ET sites (mis en cache) pour décider le layout sans flash
    // (demandeur = top bar ; aucun site = écran dédié) et alimenter les gardes
    // enfants. Fail-open : si indisponible, on retombe sur le layout par défaut.
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(currentRoleQueryOptions),
        context.queryClient.ensureQueryData(sitesQueries.mine()),
      ])
    } catch {
      // rôle/sites indisponibles : layout par défaut
    }
  },
  component: AppLayout,
})

/**
 * Déplace le focus sur le contenu à chaque changement de route réel (a11y SPA :
 * les lecteurs d'écran annoncent le nouvel écran). On compare le pathname mémorisé
 * plutôt qu'un drapeau : robuste au double-montage de StrictMode en dev.
 */
function useMainFocusRef() {
  const mainRef = useRef<HTMLElement>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const prevPath = useRef(pathname)
  useEffect(() => {
    if (prevPath.current === pathname) return
    prevPath.current = pathname
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])
  return mainRef
}

/** Lien d'évitement clavier (WCAG 2.4.1). */
function SkipLink() {
  return (
    <a
      href="#contenu"
      className="bg-background focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:ring-2"
    >
      Aller au contenu
    </a>
  )
}

/**
 * Providers communs + aiguillage de layout. Rôle et sites sont préchargés en
 * beforeLoad → disponibles dès le premier rendu (pas de flash).
 */
function AppLayout() {
  return (
    <SiteProvider>
      <TooltipProvider delayDuration={200}>
        <LayoutSwitch />
      </TooltipProvider>
    </SiteProvider>
  )
}

/**
 * Choix du layout selon le rôle et les sites accessibles :
 *  - aucun site assigné (tout rôle SAUF admin) : écran dédié (NoSiteLayout) ;
 *  - demandeur : barre supérieure seule (DemandeurLayout) ;
 *  - autres rôles : sidebar responsive (DefaultLayout).
 * L'admin a accès à tous les sites par défaut → jamais d'écran « aucun site »
 * (il doit pouvoir aller en créer un).
 */
function LayoutSwitch() {
  const { data: role } = useCurrentRole()
  const { sites, isPending } = useSiteContext()

  if (!perm.isAdmin(role) && !isPending && sites.length === 0) {
    return <NoSiteLayout />
  }
  return perm.isDemandeur(role) ? <DemandeurLayout /> : <DefaultLayout />
}

/**
 * Layout par défaut (admin / manager / technicien / lecteur). Le mode de la
 * sidebar est piloté automatiquement par la taille d'écran ET le type de pointeur :
 *  - bureau (>= lg)                           : sidebar pleine
 *  - tablette à pointeur fin (md..lg, souris) : rail d'icônes (tooltips au survol)
 *  - mobile, ou tablette tactile              : drawer (libellés visibles ; un tap
 *    ne déclenche pas de tooltip, donc pas de rail d'icônes sur tactile)
 */
function DefaultLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isWide = useMediaQuery('(min-width: 768px)')
  const isFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)')
  const showFixedSidebar = isDesktop || (isWide && isFinePointer)
  const iconOnly = !isDesktop

  const mainRef = useMainFocusRef()

  return (
    <div className="flex h-dvh">
      <SkipLink />

      {/* Sidebar fixe : rail d'icônes (tablette souris) ou pleine (bureau) */}
      {showFixedSidebar && <AppSidebar iconOnly={iconOnly} />}

      {/* Drawer (mobile + tablette tactile) : sidebar complète en overlay */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Liens de navigation principale
          </SheetDescription>
          <SidebarContent
            touch
            showHeader={false}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {!showFixedSidebar && (
          <MobileHeader onMenu={() => setDrawerOpen(true)} />
        )}
        <main
          ref={mainRef}
          id="contenu"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-auto outline-none"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/**
 * Layout du demandeur : barre supérieure unique (pas de sidebar), identique sur
 * bureau / tablette / mobile. Son seul espace de travail est « Demandes ».
 */
function DemandeurLayout() {
  const mainRef = useMainFocusRef()
  return (
    <div className="flex h-dvh flex-col">
      <SkipLink />
      <TopBar />
      <main
        ref={mainRef}
        id="contenu"
        tabIndex={-1}
        className="min-w-0 flex-1 overflow-auto outline-none"
      >
        <Outlet />
      </main>
    </div>
  )
}

/**
 * Écran « aucun site assigné » : layout barre supérieure + message. Affiché à tout
 * rôle non-admin dont le compte n'a encore aucun site (la navigation métier n'a pas
 * de sens sans site). Le bloc compte reste accessible (déconnexion, thème).
 */
function NoSiteLayout() {
  return (
    <div className="flex h-dvh flex-col">
      <SkipLink />
      <TopBar />
      <main
        id="contenu"
        tabIndex={-1}
        className="min-w-0 flex-1 overflow-auto outline-none"
      >
        <PageContainer>
          <EmptyState
            icon={Building2}
            title="Aucun site assigné"
            description="Aucun site n'a encore été assigné à ton compte. Contacte un administrateur pour qu'il t'attribue l'accès à un ou plusieurs sites."
          />
        </PageContainer>
      </main>
    </div>
  )
}
