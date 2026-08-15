import { useEffect, useRef } from 'react'
import {
  createFileRoute,
  redirect,
  Outlet,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import {
  currentRoleQueryOptions,
  useCurrentRole,
} from '@/hooks/use-current-role'
import { sitesQueries } from '@/features/sites/queries'
import { SiteProvider, useSiteContext } from '@/lib/site-context'
import * as perm from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import { AppSidebar } from '@/components/common/app-sidebar'
import { MobileHeader } from '@/components/common/mobile-header'
import { TopBar } from '@/components/common/top-bar'
import { PageContainer } from '@/components/common/page-container'
import { EmptyState } from '@/components/common/empty-state'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
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
    // enfants. Fail-open : si la RPC échoue, on ne bloque pas — LayoutSwitch
    // choisit selon le rôle chargé (DefaultLayout s'il reste absent). La RLS
    // demeure la sécurité réelle.
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(currentRoleQueryOptions),
        context.queryClient.ensureQueryData(sitesQueries.mine()),
      ])
    } catch {
      // rôle/sites indisponibles : fail-open (cf. ci-dessus)
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
      className="sr-only bg-background focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
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
 * Synchronise l'app quand le rôle ou les sites changent à chaud (ex. un admin
 * réassigne ailleurs ; les requêtes rôle/sites se rafraîchissent au retour sur
 * l'onglet via refetchOnWindowFocus). On FORCE alors la prise en compte :
 * invalidation de tout le cache (les données dépendaient des anciens droits) +
 * rejeu des gardes de route (redirection si l'écran courant n'est plus autorisé).
 * Aucune boucle : on ne déclenche que sur un vrai changement vs la valeur précédente.
 */
function useAccessSync(role: Role, siteIds: string) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const prev = useRef<{ role: Role; siteIds: string } | null>(null)

  useEffect(() => {
    if (prev.current === null) {
      prev.current = { role, siteIds }
      return
    }
    if (prev.current.role === role && prev.current.siteIds === siteIds) return
    prev.current = { role, siteIds }
    void queryClient.invalidateQueries()
    void router.invalidate()
  }, [role, siteIds, queryClient, router])
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

  // Sync à chaud : si le rôle ou les sites changent (réaffectation ailleurs), on
  // force la prise en compte (cache + gardes de route).
  const siteIds = sites
    .map((s) => s.id)
    .sort()
    .join(',')
  // DOIT rester avant tout early return : sinon un changement de droits à chaud
  // ne serait plus synchronisé (le hook ne s'exécuterait pas selon le layout rendu).
  useAccessSync(role, siteIds)

  if (!perm.isAdmin(role) && !isPending && sites.length === 0) {
    return <NoSiteLayout />
  }
  return perm.isDemandeur(role) ? <DemandeurLayout /> : <DefaultLayout />
}

// Bascules manuelles neutralisées : le repli est piloté par la largeur de fenêtre
// (état `open` contrôlé, cf. DefaultLayout) — pas de bouton ni de poignée.
const ignoreSidebarToggle = () => undefined

/**
 * Layout par défaut (admin / manager / technicien / lecteur). Le repli est
 * AUTOMATIQUE selon la largeur de fenêtre (transitions conservées), sans aucune
 * bascule manuelle :
 *  - ≥ 1024 px    : sidebar pleine ;
 *  - 768–1024 px  : rail d'icônes (réduit, libellés en tooltip au survol) ;
 *  - < 768 px     : drawer plein écran (ouvert par le burger mobile).
 */
function DefaultLayout() {
  const mainRef = useMainFocusRef()
  // `open` contrôlé par la media query : la sidebar se replie/déplie seule quand la
  // fenêtre franchit 1024 px, en animant sa largeur (transition CSS de la primitive).
  const expanded = useMediaQuery('(min-width: 1024px)')

  return (
    <SidebarProvider open={expanded} onOpenChange={ignoreSidebarToggle}>
      <SkipLink />
      <AppSidebar />
      <SidebarInset
        ref={mainRef}
        id="contenu"
        tabIndex={-1}
        className="min-h-0 min-w-0 overflow-hidden outline-none"
      >
        {/* Barre mobile (burger + marque) — masquée dès md (sidebar fixe visible). */}
        <MobileHeader />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * Layout du demandeur : barre supérieure unique (pas de sidebar), identique sur
 * bureau / tablette / mobile. Son seul espace de travail est « Demandes ».
 */
function DemandeurLayout() {
  const mainRef = useMainFocusRef()
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SkipLink />
      <TopBar />
      <main
        ref={mainRef}
        id="contenu"
        tabIndex={-1}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none"
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
  const mainRef = useMainFocusRef()
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SkipLink />
      <TopBar />
      <main
        ref={mainRef}
        id="contenu"
        tabIndex={-1}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none"
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
