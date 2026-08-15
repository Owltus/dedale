import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserRound,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { roleLabel } from '@/lib/permissions'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useTheme } from '@/components/theme'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

const THEMES = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
] as const

/** Initiales pour l'avatar : depuis le nom (« Jean Dupont » → « JD »), sinon
 *  depuis la partie locale de l'e-mail, avec repli « ?? ». */
function computeInitials(name: string, email: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join('')
      .toUpperCase()
  }
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[^a-zA-Z]/g, '').slice(0, 2)
  return (cleaned.length > 0 ? cleaned : '??').toUpperCase()
}

/** Données du compte connecté (nom affiché, initiales, rôle), partagées par les deux variants. */
function useAccountInfo() {
  const { session } = useAuth()
  const { data: role } = useCurrentRole()

  const email = session?.user.email ?? ''
  const userId = session?.user.id ?? ''
  const { data: me } = useQuery({
    ...utilisateursQueries.me(userId),
    enabled: userId !== '',
  })
  const name = (me?.nom_complet ?? '').trim()
  // Texte principal : le nom du compte (repli sur l'e-mail le temps du chargement).
  const displayName = name || email
  const initials = computeInitials(name, email)

  return { role, displayName, initials }
}

/** Pastille d'initiales. */
function Avatar({
  initials,
  className,
}: {
  initials: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground',
        className,
      )}
    >
      {initials}
    </div>
  )
}

/**
 * Contenu du menu compte (profil, thème, déconnexion), partagé par les deux
 * variants. `onNavigate` ferme le drawer mobile après une navigation.
 */
function AccountMenuContent({
  onNavigate,
  align,
  side,
}: {
  onNavigate?: () => void
  align?: 'start' | 'end'
  side?: 'right' | 'bottom' | 'top'
}) {
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  async function handleLogout() {
    onNavigate?.()
    await supabase.auth.signOut()
    await navigate({ to: '/login' })
  }

  return (
    <DropdownMenuContent align={align} side={side} className="min-w-56">
      <DropdownMenuItem
        onSelect={() => {
          onNavigate?.()
          void navigate({ to: '/profil' })
        }}
      >
        <UserRound />
        Mon profil
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        Thème
      </DropdownMenuLabel>
      {THEMES.map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
          <Icon />
          <span className="flex-1">{label}</span>
          {theme === value && <Check className="text-muted-foreground" />}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          void handleLogout()
        }}
      >
        <LogOut />
        Se déconnecter
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

/**
 * Bloc compte de la BARRE SUPÉRIEURE (layout demandeur) : avatar + nom + rôle,
 * déclencheur du menu. `responsiveText` masque le nom/rôle sous `sm` (avatar seul).
 */
export function UserMenu({
  className,
  responsiveText = false,
}: {
  className?: string
  responsiveText?: boolean
}) {
  const { role, displayName, initials } = useAccountInfo()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
            className,
          )}
        >
          <Avatar initials={initials} className="size-9" />
          <div
            className={cn(
              'min-w-0 flex-1',
              responsiveText && 'hidden sm:block',
            )}
          >
            <p className="truncate text-sm font-medium" title={displayName}>
              {displayName}
            </p>
            {role && (
              <p className="text-xs text-muted-foreground">{roleLabel(role)}</p>
            )}
          </div>
        </button>
      </DropdownMenuTrigger>
      <AccountMenuContent align="end" side="bottom" />
    </DropdownMenu>
  )
}

/**
 * Bloc compte du PIED DE SIDEBAR : bouton de menu shadcn (avatar + nom + rôle),
 * se replie en avatar seul (+ tooltip) en rail. Dropdown à droite (ou en bas sur
 * mobile). `onNavigate` ferme le drawer après une navigation.
 */
export function SidebarUserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { role, displayName, initials } = useAccountInfo()
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={displayName}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar initials={initials} />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">
                  {displayName}
                </span>
                {role && (
                  <span className="truncate text-xs text-muted-foreground">
                    {roleLabel(role)}
                  </span>
                )}
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <AccountMenuContent
            onNavigate={onNavigate}
            align="end"
            side={isMobile ? 'bottom' : 'right'}
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
