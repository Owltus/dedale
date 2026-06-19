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
import { SiteSwitcher } from '@/components/common/site-switcher'
import { UserMenu } from '@/components/common/user-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Paliers de la sidebar (rendu piloté en JS dans _app.tsx selon écran + pointeur) :
//   mobile / tablette tactile : drawer (Sheet) + barre mobile (libellés visibles)
//   tablette à pointeur fin    : rail d'icônes (iconOnly, w-16) + tooltips au survol
//   bureau (>= 1024px)         : sidebar pleine (w-64)
// Le mode tactile évite le rail (un tap ne déclenche pas de tooltip).

interface NavItem {
  to: NavKey
  label: string
  icon: ComponentType<LucideProps>
  exact?: boolean
}

// Visibilité par rôle : pilotée par canSeeNav (lib/nav.ts), source unique
// partagée avec les gardes de route. Aucun littéral de rôle ici.
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
  { to: '/chantiers', label: 'Chantiers', icon: HardHat },
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

// Item actif : fond accentué + texte en gras (sans barre verticale).
const ACTIVE_CLASS = 'bg-accent text-accent-foreground font-medium'

function NavLink({
  item,
  iconOnly,
  touch,
  onNavigate,
}: {
  item: NavItem
  iconOnly?: boolean
  touch?: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const link = (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact ?? false }}
      // aria-current="page" est déjà posé automatiquement par TanStack Router.
      activeProps={{ className: ACTIVE_CLASS }}
      onClick={onNavigate}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-offset-card flex items-center rounded-md text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&_svg]:transition-transform [&_svg]:duration-150 hover:[&_svg]:scale-110 motion-reduce:[&_svg]:transition-none',
        iconOnly ? 'h-9 justify-center' : 'gap-2 px-3 py-2',
        touch && !iconOnly && 'min-h-11',
      )}
    >
      <Icon className="size-4 shrink-0" />
      {iconOnly ? <span className="sr-only">{item.label}</span> : item.label}
    </Link>
  )

  if (!iconOnly) return link
  // En mode réduit : tooltip en portal (aucun débordement de la sidebar).
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

function NavGroup({
  title,
  items,
  role,
  iconOnly,
  touch,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  role: string | null | undefined
  iconOnly?: boolean
  touch?: boolean
  onNavigate?: () => void
}) {
  // canSeeNav renvoie true tant que le rôle n'est pas chargé (évite un flash de
  // menu vide) ; il filtre dès que le rôle est connu.
  const visible = items.filter((i) => canSeeNav(i.to, role))
  if (visible.length === 0) return null
  return (
    <div className={cn('py-2', iconOnly ? 'px-2' : 'px-3')}>
      {!iconOnly && (
        <p className="text-muted-foreground/70 px-3 pb-1 text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
      )}
      <nav aria-label={title} className="flex flex-col gap-0.5">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            item={item}
            iconOnly={iconOnly}
            touch={touch}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  )
}

/**
 * Contenu interne de la sidebar. Réutilisé dans l'aside fixe (tablette + bureau)
 * et dans le drawer mobile (Sheet). `iconOnly` réduit à des icônes + tooltips ;
 * `touch` agrandit les cibles tactiles (drawer mobile) ; `onNavigate` ferme le
 * drawer au clic d'un lien.
 */
export function SidebarContent({
  iconOnly = false,
  touch = false,
  showHeader = true,
  onNavigate,
}: {
  iconOnly?: boolean
  touch?: boolean
  showHeader?: boolean
  onNavigate?: () => void
}) {
  const { data: role } = useCurrentRole()
  return (
    <>
      {/* En-tête (logo + titre), bloc borduré indépendant. Masqué dans le drawer
          mobile : la marque est déjà dans la barre supérieure. */}
      {showHeader &&
        (iconOnly ? (
          <div className="flex h-16 shrink-0 items-center justify-center border-b px-2">
            <img
              src="/logo.svg"
              alt="Logo Dédale"
              className="size-8 shrink-0 dark:invert"
            />
            {/* Nom de l'app conservé pour les lecteurs d'écran même en rail */}
            <span className="sr-only">Dédale — Gestion de Maintenance</span>
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center gap-3 border-b px-5">
            <img
              src="/logo.svg"
              alt="Logo Dédale"
              className="size-9 shrink-0 dark:invert"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xl font-bold tracking-wide uppercase">
                Dédale
              </p>
              <p className="text-muted-foreground text-xs">
                Gestion de Maintenance
              </p>
            </div>
          </div>
        ))}

      {/* Barre de contexte « site actif » : zone bordée distincte sous le header
          (visible seulement s'il y a plusieurs sites accessibles). */}
      <SiteSwitcher variant={iconOnly ? 'sidebar-rail' : 'sidebar'} />

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2 [&>div:first-child]:pt-0">
        <NavGroup
          title="Opérationnel"
          items={OPERATIONNEL}
          role={role}
          iconOnly={iconOnly}
          touch={touch}
          onNavigate={onNavigate}
        />
        <NavGroup
          title="Référentiels"
          items={REFERENTIELS}
          role={role}
          iconOnly={iconOnly}
          touch={touch}
          onNavigate={onNavigate}
        />
      </div>

      <div className={cn('shrink-0 border-t', iconOnly ? 'p-1.5' : 'p-2')}>
        <UserMenu iconOnly={iconOnly} onNavigate={onNavigate} />
      </div>
    </>
  )
}

/**
 * Sidebar fixe, visible à partir de md (tablette + bureau). Le mode (rail réduit
 * 64px / étendu 256px) est piloté automatiquement par la taille d'écran via
 * `iconOnly`. Largeur animée.
 */
export function AppSidebar({ iconOnly }: { iconOnly: boolean }) {
  return (
    <aside
      id="app-sidebar"
      aria-label="Barre latérale"
      className={cn(
        'bg-card flex h-full min-h-0 shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none',
        iconOnly ? 'w-16' : 'w-64',
      )}
    >
      <SidebarContent iconOnly={iconOnly} />
    </aside>
  )
}
