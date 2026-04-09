import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useRechercheGlobale } from "@/hooks/use-recherche";
import {
  Building2,
  ClipboardList,
  Layers,
  MapPin,
  MessageSquare,
  Server,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// ── Configuration des types d'entités ──

interface EntityConfig {
  label: string;
  icon: LucideIcon;
}

const ENTITY_CONFIG: Record<string, EntityConfig> = {
  OT:           { label: "Ordres de travail", icon: ClipboardList },
  Gamme:        { label: "Gammes",            icon: Wrench },
  Prestataire:  { label: "Prestataires",      icon: Building2 },
  Équipement:   { label: "Équipements",       icon: Server },
  Bâtiment:     { label: "Localisations",     icon: MapPin },
  Niveau:       { label: "Localisations",     icon: MapPin },
  Local:        { label: "Localisations",     icon: MapPin },
  DI:           { label: "Demandes",          icon: MessageSquare },
};


/// Palette de commandes globale (Ctrl+K ou clic sur la recherche sidebar)
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data: results = [] } = useRechercheGlobale(query);

  // Grouper les résultats par type d'entité
  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    for (const r of results) {
      // Fusionner Bâtiment/Niveau/Local sous "Localisations"
      const groupKey = ["Bâtiment", "Niveau", "Local"].includes(r.entity_type)
        ? "Localisation"
        : r.entity_type;
      const arr = map.get(groupKey);
      if (arr) arr.push(r);
      else map.set(groupKey, [r]);
    }
    return map;
  }, [results]);

  // Raccourci Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Événement custom pour ouvrir depuis la sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ query?: string }>).detail;
      if (detail?.query) setQuery(detail.query);
      setOpen(true);
    };
    document.addEventListener("open-command-palette", handler);
    return () => document.removeEventListener("open-command-palette", handler);
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const handleSelect = (route: string) => {
    handleOpenChange(false);
    navigate(route);
  };

  const hasQuery = query.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Recherche</DialogTitle>
        <DialogDescription>Rechercher dans toute l'application</DialogDescription>
      </DialogHeader>
      <DialogContent className="top-[15%] translate-y-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl" showCloseButton={false}>
        <Command className="rounded-xl" shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher un OT, une gamme, un équipement..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-80">
            {hasQuery && results.length === 0 && (
              <CommandEmpty>Aucun résultat pour « {query} »</CommandEmpty>
            )}
            {hasQuery && Array.from(grouped.entries()).map(([groupKey, items], groupIdx) => {
              if (items.length === 0) return null;
              const config = ENTITY_CONFIG[items[0]!.entity_type] ?? { label: groupKey, icon: Layers };
              const Icon = config.icon;
              return (
                <div key={groupKey}>
                  {groupIdx > 0 && <CommandSeparator />}
                  <CommandGroup heading={config.label}>
                    {items.map((r) => (
                      <CommandItem
                        key={`${r.entity_type}-${r.entity_id}`}
                        value={`${r.entity_type}-${r.entity_id}`}
                        onSelect={() => handleSelect(r.route)}
                        className="h-9 gap-0"
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground mr-3" />
                        <span className="flex-1 truncate">{r.label}</span>
                        {r.sublabel && (
                          <span className="ml-3 max-w-40 truncate text-xs text-muted-foreground shrink-0">{r.sublabel}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
