import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import type { LucideProps } from 'lucide-react'
import {
  Banknote,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  HardHat,
  LayoutDashboard,
  LineChart,
  MapPin,
  OctagonAlert,
  MessageSquareWarning,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react'
import { useCurrentRole } from '@/hooks/use-current-role'
import {
  useNonClotures,
  type NonClotures,
} from '@/features/dashboard/use-non-clotures'
import { useSiteContext } from '@/features/sites/site-context'
import { PastilleATraiter } from '@/components/common/pastille-a-traiter'
import { prechargerPage } from '@/components/layout/prechargement-pages'
import { useQueryClient } from '@tanstack/react-query'
import { canSeeNav, NAV_LABELS, type NavKey } from '@/lib/nav'
import { SidebarSiteSwitcher } from '@/components/layout/site-switcher'
import { SidebarUserMenu } from '@/components/layout/user-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

interface NavItem {
  to: NavKey
  icon: ComponentType<LucideProps>
  exact?: boolean
}

// Visibilité par rôle : pilotée par canSeeNav (lib/nav.ts), source unique partagée
// avec les gardes de route. Aucun littéral de rôle ici.
// Les LIBELLÉS viennent de `NAV_LABELS` (lib/nav.ts), au même endroit que la
// visibilité par rôle : ils sont aussi lus par le titre d'onglet du navigateur.
// Ici ne restent que l'ordre, le regroupement et les icônes — ce qui est propre
// à la sidebar.
const OPERATIONNEL: NavItem[] = [
  { to: '/', icon: LayoutDashboard, exact: true },
  { to: '/planning', icon: CalendarDays },
  { to: '/gammes', icon: ClipboardList },
  { to: '/ordres-travail', icon: Wrench },
  { to: '/demandes', icon: MessageSquareWarning },
  { to: '/travaux', icon: HardHat },
  { to: '/evenements', icon: OctagonAlert },
  { to: '/releves', icon: LineChart },
  { to: '/registre', icon: ShieldCheck },
  { to: '/documents', icon: FileText },
  { to: '/investissements', icon: Banknote },
]

const REFERENTIELS: NavItem[] = [
  { to: '/sites', icon: Building2 },
  { to: '/localisations', icon: MapPin },
  { to: '/equipements', icon: Boxes },
  { to: '/prestataires', icon: Briefcase },
  { to: '/bibliotheque', icon: BookOpen },
  { to: '/utilisateurs', icon: Users },
]

// Entrées qui portent la compteur des éléments non clôturés.
const PASTILLES: Partial<Record<NavKey, keyof NonClotures>> = {
  '/demandes': 'demandes',
  '/travaux': 'travaux',
  '/evenements': 'evenements',
}

// Item actif : fond accentué + texte en gras. Piloté par le routeur (activeProps),
// pas par `isActive` — cohérent avec le reste de l'app.
const ACTIVE_CLASS =
  'bg-sidebar-accent text-sidebar-accent-foreground font-medium'

function NavGroup({
  title,
  items,
  role,
  nonClotures,
  onNavigate,
  onIntention,
}: {
  title: string
  items: NavItem[]
  role: string | null | undefined
  nonClotures: NonClotures
  onNavigate?: () => void
  /** Survol / focus / toucher d'un lien : précharge les données de la page. */
  onIntention: (page: NavKey) => void
}) {
  // canSeeNav renvoie true tant que le rôle n'est pas chargé (évite un flash de
  // menu vide) ; il filtre dès que le rôle est connu.
  const visible = items.filter((i) => canSeeNav(i.to, role))
  if (visible.length === 0) return null
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => {
            const Icon = item.icon
            const label = NAV_LABELS[item.to]
            const cle = PASTILLES[item.to]
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild tooltip={label}>
                  <Link
                    to={item.to}
                    activeOptions={{ exact: item.exact ?? false }}
                    // aria-current="page" posé automatiquement par TanStack Router.
                    activeProps={{ className: ACTIVE_CLASS }}
                    onClick={onNavigate}
                    onMouseEnter={() => onIntention(item.to)}
                    onFocus={() => onIntention(item.to)}
                    onTouchStart={() => onIntention(item.to)}
                  >
                    <Icon />
                    <span>{label}</span>
                    {cle ? (
                      // Ouverte : au bout de la ligne. Repliée (rail
                      // d'icônes) : en coin de l'icône.
                      <PastilleATraiter
                        nombre={nonClotures[cle]}
                        className="ml-auto group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:h-3.5 group-data-[collapsible=icon]:min-w-3.5 group-data-[collapsible=icon]:text-[9px]"
                      />
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/**
 * Barre latérale de l'app (rôles hors demandeur). Repliable en rail d'icônes
 * (`collapsible="icon"`, tooltips au survol), drawer sur mobile — le tout géré par
 * les primitives shadcn. En-tête : marque + sélecteur de site ; pied : compte.
 */
export function AppSidebar() {
  const { data: role } = useCurrentRole()
  const { isMobile, setOpenMobile } = useSidebar()
  const { activeSiteId } = useSiteContext()
  const nonClotures = useNonClotures(activeSiteId)
  const qc = useQueryClient()
  const intention = (page: NavKey) => prechargerPage(qc, page, activeSiteId)
  // Un clic sur un lien ferme le drawer mobile (sur desktop, sans effet).
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Tableau de bord">
              <Link to="/" onClick={closeMobile}>
                <img
                  src="/logo.svg"
                  alt="Dédale"
                  className="size-8 shrink-0 dark:invert"
                />
                <div
                  aria-hidden
                  className="grid flex-1 text-left leading-tight"
                >
                  <span className="truncate text-base font-bold tracking-wide uppercase">
                    Dédale
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Gestion de Maintenance
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSiteSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <NavGroup
          title="Opérationnel"
          items={OPERATIONNEL}
          role={role}
          nonClotures={nonClotures}
          onNavigate={closeMobile}
          onIntention={intention}
        />
        <NavGroup
          title="Référentiels"
          items={REFERENTIELS}
          role={role}
          nonClotures={nonClotures}
          onNavigate={closeMobile}
          onIntention={intention}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu onNavigate={closeMobile} />
      </SidebarFooter>
    </Sidebar>
  )
}
