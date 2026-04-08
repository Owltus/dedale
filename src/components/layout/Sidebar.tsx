import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarSearch } from "./SidebarSearch";
import { SidebarNav } from "./SidebarNav";
import { LogoIcon } from "@/components/icons/LogoIcon";

// Seuil auto-collapse sidebar
const BREAKPOINT = 1024;

/// Sidebar de navigation collapsible — collapse auto selon la largeur de fenêtre
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < BREAKPOINT);

  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground overflow-hidden transition-[width] duration-300 ease-in-out",
        collapsed ? "w-12" : "w-60"
      )}
    >
      {/* En-tête */}
      <div className={cn(
        "flex shrink-0 items-center overflow-hidden transition-all duration-300",
        collapsed ? "justify-center px-1 py-3" : "gap-2.5 px-4 pt-5 pb-4"
      )}>
        <LogoIcon className={cn("shrink-0 transition-all duration-300", collapsed ? "size-7" : "size-8")} />
        <div className={cn(
          "flex flex-col overflow-hidden transition-all duration-300",
          collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-40"
        )}>
          <span className="text-lg font-bold whitespace-nowrap leading-tight">DÉDALE</span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">Gestion de Maintenance</span>
        </div>
      </div>

      {/* Recherche */}
      <SidebarSearch collapsed={collapsed} onExpand={() => setCollapsed(false)} />

      {/* Navigation */}
      <SidebarNav collapsed={collapsed} />

      {/* Footer — Paramètres */}
      <div className={cn("border-t", collapsed ? "p-1" : "p-2")}>
        <FooterLink collapsed={collapsed} />
      </div>
    </aside>
  );
}

function FooterLink({ collapsed }: { collapsed: boolean }) {
  const link = (
    <NavLink
      to="/parametres"
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-md py-1.5 text-sm whitespace-nowrap transition-colors duration-150",
          collapsed ? "justify-center px-1" : "gap-3 px-2",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent/50"
        )
      }
    >
      <Settings className="size-4 shrink-0" />
      <span className={cn(
        "truncate overflow-hidden transition-all duration-300",
        collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-48"
      )}>Paramètres</span>
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger className="block w-full">
          {link}
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium">Paramètres</TooltipContent>
      </Tooltip>
    );
  }

  return link;
}
