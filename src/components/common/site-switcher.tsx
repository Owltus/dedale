import { Building2, Check, ChevronDown } from 'lucide-react'
import { useSiteContext } from '@/lib/site-context'
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

// Socle de classes commun aux déclencheurs (hover + focus visible).
const TRIGGER_BASE =
  'text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-offset-card rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2'

/** Contenu du menu déroulant des sites (label + liste), partagé par les variants. */
function SiteMenuContent({
  sites,
  activeSiteId,
  onSelect,
  side,
}: {
  sites: readonly { id: string; nom: string }[]
  activeSiteId: string | null
  onSelect: (id: string) => void
  side?: 'right'
}) {
  return (
    <DropdownMenuContent
      side={side}
      align="start"
      className={side === 'right' ? 'min-w-48' : 'min-w-56'}
    >
      <DropdownMenuLabel className="text-muted-foreground text-xs">
        Site actif
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {sites.map((site) => (
        <DropdownMenuItem key={site.id} onSelect={() => onSelect(site.id)}>
          <Building2 className="opacity-70" />
          <span className="flex-1 truncate">{site.nom}</span>
          {site.id === activeSiteId && (
            <Check className="text-muted-foreground" />
          )}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  )
}

/**
 * Sélecteur de site actif. Masqué s'il y a 0 ou 1 site accessible : sans choix à
 * faire, le nom du site unique n'encombre ni la sidebar ni la top bar (les sites
 * attribués restent consultables sur la page « Mon profil »).
 *
 * `variant` :
 *  - `sidebar` (défaut) : barre de contexte bordée sous le header (bouton + nom) ;
 *  - `sidebar-rail` : rail réduit (icône + tooltip, menu à droite) ;
 *  - `bar` : top bar du demandeur (séparateur + bouton, responsive : tronque).
 */
export function SiteSwitcher({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'sidebar-rail' | 'bar'
}) {
  const { sites, activeSiteId, setActiveSiteId } = useSiteContext()

  // 0 ou 1 site : rien à sélectionner → pas de sélecteur.
  if (sites.length <= 1) return null
  const active = sites.find((s) => s.id === activeSiteId) ?? sites[0]
  if (!active) return null

  const menu = (
    <SiteMenuContent
      sites={sites}
      activeSiteId={activeSiteId}
      onSelect={setActiveSiteId}
      side={variant === 'sidebar-rail' ? 'right' : undefined}
    />
  )

  // ─── Rail réduit : icône centrée + tooltip, zone bordée. ───
  if (variant === 'sidebar-rail') {
    return (
      <div className="border-b px-2 py-2">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger
                aria-label="Changer de site"
                className={cn(
                  TRIGGER_BASE,
                  'text-muted-foreground flex h-8 w-full items-center justify-center',
                )}
              >
                <Building2 className="size-4" />
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{active.nom}</TooltipContent>
          </Tooltip>
          {menu}
        </DropdownMenu>
      </div>
    )
  }

  // ─── Top bar du demandeur : séparateur + bouton, responsive (tronque). ───
  if (variant === 'bar') {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="bg-border h-8 w-px shrink-0" aria-hidden />
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              TRIGGER_BASE,
              'flex h-9 max-w-full min-w-0 items-center gap-1 px-2 text-sm',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {active.nom}
            </span>
            <ChevronDown className="text-muted-foreground size-4 shrink-0" />
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>
    )
  }

  // ─── Sidebar étendu : barre de contexte bordée, bouton pleine largeur. ───
  return (
    <div className="border-b px-3 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            TRIGGER_BASE,
            'flex h-8 w-full items-center gap-1 px-3 text-sm',
          )}
        >
          <span className="flex-1 truncate text-left font-medium">
            {active.nom}
          </span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </div>
  )
}
