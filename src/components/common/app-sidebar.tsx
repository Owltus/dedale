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
  MessageSquareWarning,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react'
import { useCurrentRole } from '@/hooks/use-current-role'
import { canSeeNav, type NavKey } from '@/lib/nav'
import { SidebarSiteSwitcher } from '@/components/common/site-switcher'
import { SidebarUserMenu } from '@/components/common/user-menu'
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
  label: string
  icon: ComponentType<LucideProps>
  exact?: boolean
}

// Visibilité par rôle : pilotée par canSeeNav (lib/nav.ts), source unique partagée
// avec les gardes de route. Aucun littéral de rôle ici.
const OPERATIONNEL: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { to: '/planning', label: 'Planning', icon: CalendarDays },
  { to: '/gammes', label: 'Plan de maintenance', icon: ClipboardList },
  { to: '/ordres-travail', label: 'Ordres de travail', icon: Wrench },
  {
    to: '/demandes',
    label: "Demandes d'intervention",
    icon: MessageSquareWarning,
  },
  { to: '/travaux', label: 'Travaux', icon: HardHat },
  { to: '/releves', label: 'Relevés', icon: LineChart },
  { to: '/registre', label: 'Registre de sécurité', icon: ShieldCheck },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/investissements', label: 'Investissements', icon: Banknote },
]

const REFERENTIELS: NavItem[] = [
  { to: '/sites', label: 'Sites', icon: Building2 },
  { to: '/localisations', label: 'Localisations', icon: MapPin },
  { to: '/equipements', label: 'Équipements', icon: Boxes },
  { to: '/prestataires', label: 'Prestataires', icon: Briefcase },
  { to: '/bibliotheque', label: 'Bibliothèque', icon: BookOpen },
  { to: '/utilisateurs', label: 'Utilisateurs', icon: Users },
]

// Item actif : fond accentué + texte en gras. Piloté par le routeur (activeProps),
// pas par `isActive` — cohérent avec le reste de l'app.
const ACTIVE_CLASS = 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'

function NavGroup({
  title,
  items,
  role,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  role: string | null | undefined
  onNavigate?: () => void
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
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild tooltip={item.label}>
                  <Link
                    to={item.to}
                    activeOptions={{ exact: item.exact ?? false }}
                    // aria-current="page" posé automatiquement par TanStack Router.
                    activeProps={{ className: ACTIVE_CLASS }}
                    onClick={onNavigate}
                  >
                    <Icon />
                    <span>{item.label}</span>
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
                  <span className="text-muted-foreground truncate text-xs">
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
          onNavigate={closeMobile}
        />
        <NavGroup
          title="Référentiels"
          items={REFERENTIELS}
          role={role}
          onNavigate={closeMobile}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserMenu onNavigate={closeMobile} />
      </SidebarFooter>
    </Sidebar>
  )
}
