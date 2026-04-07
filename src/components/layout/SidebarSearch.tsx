import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRechercheGlobale } from "@/hooks/use-recherche";
import { Search } from "lucide-react";

interface SidebarSearchProps {
  collapsed: boolean;
  onExpand: () => void;
}

/// Barre de recherche globale avec dropdown de résultats
export function SidebarSearch({ collapsed, onExpand }: SidebarSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useRechercheGlobale(query);
  const showDropdown = focused && query.trim().length >= 2 && results.length > 0;

  // Reset index quand les résultats changent
  useEffect(() => setSelectedIdx(0), [results]);

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Raccourci Ctrl+K pour focus l'input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSelectResult = (route: string) => {
    setQuery("");
    setFocused(false);
    navigate(route);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIdx]) handleSelectResult(results[selectedIdx].route);
    } else if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={cn("relative pb-3", collapsed ? "px-1" : "px-2")}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger className="block w-full">
            <button
              type="button"
              onClick={() => { onExpand(); setTimeout(() => inputRef.current?.focus(), 350); }}
              className="flex w-full items-center justify-center rounded-md border p-2 text-muted-foreground hover:bg-sidebar-accent transition-colors"
            >
              <Search className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Recherche (Ctrl+K)</TooltipContent>
        </Tooltip>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher..."
            className="flex h-8 w-full rounded-md border bg-transparent pl-8 pr-14 text-sm text-sidebar-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Ctrl+K
          </kbd>
        </div>
      )}
      {/* Dropdown de résultats */}
      {showDropdown && !collapsed && (
        <div
          ref={dropdownRef}
          className="absolute left-2 right-2 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {results.map((r, i) => (
            <button
              key={`${r.entity_type}-${r.entity_id}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelectResult(r.route); }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left transition-colors",
                i === selectedIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              )}
            >
              <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">
                {r.entity_type}
              </Badge>
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
