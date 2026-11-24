import { Building2, Check, ChevronDown, ChevronsUpDown } from 'lucide-react'
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

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
  side?: 'right' | 'bottom'
}) {
  return (
    <DropdownMenuContent side={side} align="start" className="min-w-56">
      <DropdownMenuLabel className="text-xs text-muted-foreground">
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
 * Sélecteur de site actif de la BARRE SUPÉRIEURE (layout demandeur). Masqué s'il y
 * a 0 ou 1 site accessible : sans choix à faire, le nom du site unique n'encombre
 * pas (les sites attribués restent consultables sur « Mon profil »).
 */
export function SiteSwitcher() {
  const { sites, activeSiteId, setActiveSiteId } = useSiteContext()

  if (sites.length <= 1) return null
  const active = sites.find((s) => s.id === activeSiteId) ?? sites[0]
  if (!active) return null

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="h-8 w-px shrink-0 bg-border" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'rounded-md text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
            'flex h-9 max-w-full min-w-0 items-center gap-1 px-2 text-sm',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left font-medium">
            {active.nom}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <SiteMenuContent
          sites={sites}
          activeSiteId={activeSiteId}
          onSelect={setActiveSiteId}
        />
      </DropdownMenu>
    </div>
  )
}

/**
 * Sélecteur de site dans la SIDEBAR. S'intègre au menu shadcn : se replie en icône
 * (Building2 + tooltip) quand la sidebar est en rail, dropdown à droite (ou en bas
 * sur mobile). Masqué s'il n'y a pas de choix (0/1 site).
 */
export function SidebarSiteSwitcher() {
  const { sites, activeSiteId, setActiveSiteId } = useSiteContext()
  const { isMobile } = useSidebar()

  if (sites.length <= 1) return null
  const active = sites.find((s) => s.id === activeSiteId) ?? sites[0]
  if (!active) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={active.nom}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Building2 />
              <span className="flex-1 truncate text-left font-medium">
                {active.nom}
              </span>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <SiteMenuContent
            sites={sites}
            activeSiteId={activeSiteId}
            onSelect={setActiveSiteId}
            side={isMobile ? 'bottom' : 'right'}
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
