import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useRechercheGlobale } from "@/hooks/use-recherche";

/// Palette de commandes globale (Ctrl+K)
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data: results = [] } = useRechercheGlobale(query);

  // Événement custom pour ouvrir la palette depuis un autre composant
  useEffect(() => {
    const onCustomOpen = () => setOpen(true);
    document.addEventListener("open-command-palette", onCustomOpen);
    return () => document.removeEventListener("open-command-palette", onCustomOpen);
  }, []);

  const handleSelect = (route: string) => {
    setOpen(false);
    setQuery("");
    navigate(route);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Recherche</DialogTitle>
        <DialogDescription>Rechercher dans toute l'application</DialogDescription>
      </DialogHeader>
      <DialogContent className="top-1/3 translate-y-0 overflow-hidden rounded-xl p-0" showCloseButton={false}>
        <Command className="rounded-xl">
          <CommandInput
            placeholder="Rechercher partout..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {query.length < 2 ? "Tapez au moins 2 caractères..." : "Aucun résultat."}
            </CommandEmpty>
            {results.length > 0 && (
              <CommandGroup heading="Résultats">
                {results.map((r) => (
                  <CommandItem
                    key={`${r.entity_type}-${r.entity_id}`}
                    value={`${r.label} ${r.sublabel ?? ""}`}
                    onSelect={() => handleSelect(r.route)}
                  >
                    <Badge variant="outline" className="mr-2 text-xs">
                      {r.entity_type}
                    </Badge>
                    <span className="flex-1">{r.label}</span>
                    {r.sublabel && (
                      <span className="text-sm text-muted-foreground">{r.sublabel}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
