import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_SECTIONS, type NavItem } from "@/lib/constants/nav-sections";

interface SidebarNavProps {
  collapsed: boolean;
}

// Vérifie si un item est actif (path exact pour "/", prefix pour les autres)
function useIsActive(path: string): boolean {
  const { pathname } = useLocation();
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const isActive = useIsActive(item.path);

  const link = (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={cn(
        "group/nav-item flex items-center rounded-md py-1.5 text-sm whitespace-nowrap transition-colors duration-150",
        collapsed ? "justify-center px-1" : "gap-3 px-2",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      )}
    >
      <item.icon className={cn(
        "size-4 shrink-0 transition-transform duration-150",
        !isActive && "group-hover/nav-item:scale-110"
      )} />
      <span className={cn(
        "truncate overflow-hidden transition-all duration-300",
        collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-48"
      )}>{item.label}</span>
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger className="block w-full">
          {link}
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

/// Sections de navigation groupées de la sidebar
export function SidebarNav({ collapsed }: SidebarNavProps) {
  return (
    <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden transition-[padding] duration-300", collapsed ? "px-1" : "px-2")}>
      {NAV_SECTIONS.map((section, sectionIdx) => (
        <div key={section.title}>
          {sectionIdx > 0 && (
            <Separator className={cn(
              "transition-all duration-300",
              collapsed ? "my-2 mx-1" : "my-3"
            )} />
          )}
          <div className={cn(
            "overflow-hidden transition-all duration-300",
            collapsed ? "h-0 opacity-0 mb-0" : "h-5 opacity-100 mb-1"
          )}>
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              {section.title}
            </p>
          </div>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.path}>
                <NavItemLink item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
