import { useMemo, useState } from "react";
import { ChevronDown, MapPin, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useLocalisationsTree } from "@/hooks/use-localisations";
import { useEquipements } from "@/hooks/use-equipements";

interface LieuEquipementPickerProps {
  idLocal: number | null;
  idEquipement: number | null;
  onChange: (idLocal: number | null, idEquipement: number | null) => void;
}

/// Sélecteur couplé lieu + équipement (sélection unique).
/// Synchro métier : choisir un équipement remplit son lieu ; changer de lieu
/// nettoie l'équipement s'il n'appartient pas au nouveau lieu.
export function LieuEquipementPicker({ idLocal, idEquipement, onChange }: LieuEquipementPickerProps) {
  const { data: tree = [] } = useLocalisationsTree();
  const { data: equipements = [] } = useEquipements();
  const [lieuOpen, setLieuOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);

  // Si un seul bâtiment, on l'omet du label pour alléger
  const hasMultipleBatiments = useMemo(
    () => new Set(tree.map((n) => n.nom_batiment)).size > 1,
    [tree],
  );

  const localLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    tree.forEach((n) => {
      const label = hasMultipleBatiments ? n.label : `${n.nom_niveau} › ${n.nom_local}`;
      m.set(n.id_local, label);
    });
    return m;
  }, [tree, hasMultipleBatiments]);

  const equipementsFiltres = useMemo(() => {
    if (!idLocal) return equipements;
    return equipements.filter((e) => e.id_local === idLocal);
  }, [equipements, idLocal]);

  const selectedLocalLabel = idLocal ? localLabelMap.get(idLocal) ?? null : null;
  const selectedEquipement = idEquipement ? equipements.find((e) => e.id_equipement === idEquipement) ?? null : null;

  const pickEquipement = (idEq: number) => {
    const eq = equipements.find((e) => e.id_equipement === idEq);
    if (!eq) return;
    onChange(eq.id_local ?? idLocal, idEq);
    setEquipOpen(false);
  };

  const pickLocal = (idLoc: number) => {
    let nextEquip = idEquipement;
    if (idEquipement) {
      const eq = equipements.find((e) => e.id_equipement === idEquipement);
      if (!eq || eq.id_local !== idLoc) nextEquip = null;
    }
    onChange(idLoc, nextEquip);
    setLieuOpen(false);
  };

  return (
    <>
      {/* Lieu */}
      <div className="space-y-2">
        <Label>Où ?</Label>
        <div className="flex items-stretch gap-2">
          <Popover open={lieuOpen} onOpenChange={setLieuOpen}>
            <PopoverTrigger
              render={
                <Button type="button" variant="outline" className="flex-1 justify-between font-normal min-h-9">
                  {selectedLocalLabel ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <MapPin className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{selectedLocalLabel}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sélectionner un lieu…</span>
                  )}
                  <ChevronDown className="size-4 opacity-50 shrink-0" />
                </Button>
              }
            />
            <PopoverContent className="w-(--anchor-width) p-0" align="start" sideOffset={4}>
              <Command>
                <CommandInput placeholder="Filtrer les lieux…" autoFocus />
                <CommandList className="max-h-72">
                  <CommandEmpty>Aucun lieu trouvé.</CommandEmpty>
                  <CommandGroup>
                    {tree.map((n) => {
                      const display = localLabelMap.get(n.id_local) ?? n.label;
                      return (
                        <CommandItem key={n.id_local} value={display} onSelect={() => pickLocal(n.id_local)}>
                          <MapPin className="size-4 text-muted-foreground" />
                          <span className="truncate">{display}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {idLocal && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(null, null)}
              title="Effacer le lieu"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Équipement */}
      <div className="space-y-2">
        <Label>Équipement</Label>
        <div className="flex items-stretch gap-2">
          <Popover open={equipOpen} onOpenChange={setEquipOpen}>
            <PopoverTrigger
              render={
                <Button type="button" variant="outline" className="flex-1 justify-between font-normal min-h-9">
                  {selectedEquipement ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <Package className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{selectedEquipement.nom_affichage}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {idLocal ? "Sélectionner un équipement de ce lieu…" : "Sélectionner un équipement…"}
                    </span>
                  )}
                  <ChevronDown className="size-4 opacity-50 shrink-0" />
                </Button>
              }
            />
            <PopoverContent className="w-(--anchor-width) p-0" align="start" sideOffset={4}>
              <Command>
                <CommandInput
                  placeholder={idLocal ? "Filtrer parmi ce lieu…" : "Filtrer parmi tous les équipements…"}
                  autoFocus
                />
                <CommandList className="max-h-72">
                  <CommandEmpty>Aucun équipement.</CommandEmpty>
                  <CommandGroup>
                    {equipementsFiltres.map((e) => {
                      const sub = e.id_local ? localLabelMap.get(e.id_local) : undefined;
                      return (
                        <CommandItem
                          key={e.id_equipement}
                          value={`${e.nom_affichage} ${sub ?? ""}`}
                          onSelect={() => pickEquipement(e.id_equipement)}
                        >
                          <Package className="size-4 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="truncate">{e.nom_affichage}</div>
                            {sub && !idLocal && (
                              <div className="text-xs text-muted-foreground truncate">{sub}</div>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {idEquipement && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(idLocal, null)}
              title="Effacer l'équipement"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
