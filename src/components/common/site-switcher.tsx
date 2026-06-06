import { Building2, Check } from 'lucide-react'
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

/**
 * Sélecteur de site actif (masqué s'il n'y a qu'un seul site accessible).
 * Mode étendu : un `select` pleine largeur. Mode réduit (`iconOnly`) : une icône
 * (avec tooltip du site courant) ouvrant un menu déroulant des sites.
 */
export function SiteSwitcher({ iconOnly = false }: { iconOnly?: boolean }) {
  const { sites, activeSiteId, setActiveSiteId } = useSiteContext()

  if (sites.length <= 1) return null

  if (iconOnly) {
    const active = sites.find((s) => s.id === activeSiteId)
    return (
      <div className="px-2 pt-3">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger
                aria-label="Changer de site"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 focus-visible:ring-offset-card flex h-9 w-full items-center justify-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 [&_svg]:transition-transform [&_svg]:duration-150 hover:[&_svg]:scale-110 motion-reduce:[&_svg]:transition-none"
              >
                <Building2 className="size-4" />
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">
              {active?.nom ?? 'Changer de site'}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" className="min-w-48">
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Site actif
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sites.map((site) => (
              <DropdownMenuItem
                key={site.id}
                onSelect={() => setActiveSiteId(site.id)}
              >
                <Building2 className="opacity-70" />
                <span className="flex-1 truncate">{site.nom}</span>
                {site.id === activeSiteId && (
                  <Check className="text-muted-foreground" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="px-3 pt-3">
      <select
        value={activeSiteId ?? ''}
        onChange={(e) => setActiveSiteId(e.target.value)}
        aria-label="Site actif"
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
      >
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.nom}
          </option>
        ))}
      </select>
    </div>
  )
}
