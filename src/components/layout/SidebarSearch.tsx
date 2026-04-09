import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search } from "lucide-react";

interface SidebarSearchProps {
  collapsed: boolean;
  onExpand: () => void;
}

function openPalette(initialQuery?: string) {
  document.dispatchEvent(
    new CustomEvent("open-command-palette", { detail: { query: initialQuery } })
  );
}

/// Trigger de recherche dans la sidebar — bouton stylé en input qui ouvre la CommandPalette
export function SidebarSearch({ collapsed, onExpand }: SidebarSearchProps) {
  return (
    <div className={cn("relative pb-3", collapsed ? "px-1" : "px-2")}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger className="block w-full">
            <button
              type="button"
              onClick={() => { onExpand(); openPalette(); }}
              className="flex w-full items-center justify-center rounded-md border p-2 text-muted-foreground hover:bg-sidebar-accent transition-colors"
            >
              <Search className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Recherche (Ctrl+K)</TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={() => openPalette()}
          onKeyDown={(e) => {
            // Caractère imprimable → ouvre le modal avec ce caractère pré-rempli
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              openPalette(e.key);
            }
          }}
          className="relative flex h-8 w-full items-center rounded-md border bg-transparent text-sm text-muted-foreground hover:bg-sidebar-accent/50 transition-colors cursor-text"
        >
          <Search className="ml-2.5 size-4 shrink-0" />
          <span className="ml-2 truncate">Rechercher...</span>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px]">
            Ctrl+K
          </kbd>
        </button>
      )}
    </div>
  );
}
