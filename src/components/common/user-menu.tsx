import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

/**
 * Bloc compte du pied de sidebar : la ligne entière (avatar + nom + rôle) est le
 * déclencheur du menu (profil, thème, déconnexion). Pas de bouton imbriqué.
 */
export function UserMenu({
  onNavigate,
  iconOnly = false,
  className,
  responsiveText = false,
}: {
  onNavigate?: () => void
  iconOnly?: boolean
  /** Classe appliquée au déclencheur étendu (ex. largeur dans une top bar). */
  className?: string
  /** Masque le nom/rôle sous `sm` (top bar mobile : avatar seul). */
  responsiveText?: boolean
}) {
  const { session } = useAuth()
  const { data: role } = useCurrentRole()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  const email = session?.user.email ?? ''
  const userId = session?.user.id ?? ''
  const { data: me } = useQuery({
    ...utilisateursQueries.me(userId),
    enabled: userId !== '',
  })
  const name = (me?.nom_complet ?? '').trim()
  // Texte principal : le nom du compte (repli sur l'e-mail le temps du chargement).
  const displayName = name || email
  // Initiales : à partir du nom (« Jean Dupont » → « JD »), sinon de l'e-mail.
  const initials = computeInitials(name, email)

  async function handleLogout() {
    onNavigate?.()
    await supabase.auth.signOut()
    await navigate({ to: '/login' })
  }

  const avatar = (
    <div className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
      {initials}
    </div>
  )

  return (
    <DropdownMenu>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              aria-label="Menu du compte"
              className="hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-offset-card flex w-full items-center justify-center rounded-md p-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {avatar}
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{displayName}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-offset-card flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              className,
            )}
          >
            {avatar}
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
                <p className="text-muted-foreground text-xs">
                  {roleLabel(role)}
                </p>
              )}
            </div>
          </button>
        </DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        align={iconOnly ? 'start' : 'end'}
        side={iconOnly ? 'right' : 'bottom'}
        className="min-w-56"
      >
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
        <DropdownMenuLabel className="text-muted-foreground text-xs">
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
    </DropdownMenu>
  )
}
