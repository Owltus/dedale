import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import type { LucideProps } from 'lucide-react'
import {
  Banknote,
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
import { SiteSwitcher } from '@/components/common/site-switcher'
import { UserMenu } from '@/components/common/user-menu'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<LucideProps>
  exact?: boolean
  /** Si défini, l'entrée n'est visible que pour ces rôles. */
  roles?: string[]
}

// Rôles « métier » hors demandeur (qui ne voit que ses demandes + l'accueil).
const METIER = ['admin', 'manager', 'technicien', 'lecteur']

const OPERATIONNEL: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { to: '/planning', label: 'Planning', icon: CalendarDays, roles: METIER },
  { to: '/gammes', label: 'Gammes', icon: ClipboardList, roles: METIER },
  {
    to: '/ordres-travail',
    label: 'Ordres de travail',
    icon: Wrench,
    roles: METIER,
  },
  {
    to: '/demandes',
    label: "Demandes d'intervention",
    icon: MessageSquareWarning,
  },
  { to: '/chantiers', label: 'Chantiers', icon: HardHat, roles: METIER },
  { to: '/releves', label: 'Relevés', icon: LineChart, roles: METIER },
  {
    to: '/registre',
    label: 'Registre de sécurité',
    icon: ShieldCheck,
    roles: METIER,
  },
  { to: '/documents', label: 'Documents', icon: FileText, roles: METIER },
  {
    to: '/investissements',
    label: 'Investissements',
    icon: Banknote,
    roles: ['admin', 'manager'],
  },
]

const REFERENTIELS: NavItem[] = [
  { to: '/sites', label: 'Sites', icon: Building2, roles: ['admin'] },
  { to: '/localisations', label: 'Localisations', icon: MapPin, roles: METIER },
  { to: '/equipements', label: 'Équipements', icon: Boxes, roles: METIER },
  {
    to: '/prestataires',
    label: 'Prestataires',
    icon: Briefcase,
    roles: METIER,
  },
  {
    to: '/utilisateurs',
    label: 'Utilisateurs',
    icon: Users,
    roles: ['admin', 'manager'],
  },
]

function NavLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact ?? false }}
      activeProps={{ className: 'bg-accent text-accent-foreground' }}
      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  )
}

function NavGroup({
  title,
  items,
  role,
}: {
  title: string
  items: NavItem[]
  role: string | null | undefined
}) {
  // Tant que le rôle n'est pas chargé, on affiche tout (évite un flash de menu vide).
  const visible = items.filter(
    (i) => !i.roles || !role || i.roles.includes(role),
  )
  if (visible.length === 0) return null
  return (
    <div className="px-3 py-2">
      <p className="text-muted-foreground/70 px-3 pb-1 text-xs font-medium tracking-wide uppercase">
        {title}
      </p>
      <nav className="flex flex-col gap-0.5">
        {visible.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
      </nav>
    </div>
  )
}

export function AppSidebar() {
  const { data: role } = useCurrentRole()
  return (
    <aside className="bg-card flex h-screen w-60 shrink-0 flex-col border-r">
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
        <img
          src="/logo.svg"
          alt="Logo Dédale"
          className="size-10 shrink-0 dark:invert"
        />
        <div className="leading-tight">
          <p className="text-xl font-bold tracking-wide uppercase">Dédale</p>
          <p className="text-muted-foreground text-xs">
            Gestion de Maintenance
          </p>
        </div>
      </div>

      <div className="px-3 pt-3">
        <SiteSwitcher />
      </div>

      <div className="flex-1 overflow-auto py-2">
        <NavGroup title="Opérationnel" items={OPERATIONNEL} role={role} />
        <NavGroup title="Référentiels" items={REFERENTIELS} role={role} />
      </div>

      <div className="shrink-0 border-t p-3">
        <UserMenu />
      </div>
    </aside>
  )
}
