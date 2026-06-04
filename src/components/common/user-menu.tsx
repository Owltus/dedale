import { useNavigate } from '@tanstack/react-router'
import { Check, LogOut, Monitor, Moon, MoreVertical, Sun } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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

const THEMES = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
] as const

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  technicien: 'Technicien',
  lecteur: 'Lecteur',
  demandeur: 'Demandeur',
}

/**
 * Bloc compte du pied de sidebar : la ligne entière (avatar + email + rôle) est
 * le déclencheur du menu (thème + déconnexion). Pas de bouton imbriqué.
 */
export function UserMenu() {
  const { session } = useAuth()
  const { data: role } = useCurrentRole()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  const email = session?.user.email ?? ''
  const initials = (email.slice(0, 2) || '??').toUpperCase()

  async function handleLogout() {
    await supabase.auth.signOut()
    await navigate({ to: '/login' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors outline-none focus-visible:ring-2"
        >
          <div className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={email}>
              {email}
            </p>
            {role && (
              <p className="text-muted-foreground text-xs">
                {ROLE_LABELS[role] ?? role}
              </p>
            )}
          </div>
          <MoreVertical className="text-muted-foreground size-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
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
