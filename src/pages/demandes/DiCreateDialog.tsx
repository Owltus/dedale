import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Briefcase, ChevronDown, X, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LieuEquipementPicker } from "./LieuEquipementPicker";
import { useEquipements } from "@/hooks/use-equipements";
import { usePrestataires } from "@/hooks/use-prestataires";
import { useModelesDi } from "@/hooks/use-referentiels";
import { useCreateDemande, useLinkDiLocalisation, useLinkDiEquipement } from "@/hooks/use-demandes";
import { todayIso } from "@/lib/utils/format";
import type { ModeleDi } from "@/lib/types/referentiels";

interface DiCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiCreateDialog({ open, onOpenChange }: DiCreateDialogProps) {
  const navigate = useNavigate();
  const { data: equipements = [] } = useEquipements();
  const { data: prestataires = [] } = usePrestataires();
  const { data: modeles = [] } = useModelesDi();
  const createDemande = useCreateDemande();
  const linkLocalisation = useLinkDiLocalisation();
  const linkEquipement = useLinkDiEquipement();

  const [idLocal, setIdLocal] = useState<number | null>(null);
  const [idEquipement, setIdEquipement] = useState<number | null>(null);
  const [constat, setConstat] = useState("");
  const [idPrestataire, setIdPrestataire] = useState<number | null>(null);
  const [dateConstat, setDateConstat] = useState<string>(todayIso());
  const [prestaOpen, setPrestaOpen] = useState(false);

  const selectedPrestataire = idPrestataire ? prestataires.find((p) => p.id_prestataire === idPrestataire) ?? null : null;
  // Déduit du contenu : si le constat correspond exactement à celui d'un modèle, ce modèle est "appliqué".
  // Une édition manuelle casse l'égalité et fait disparaître le badge automatiquement.
  const appliedModele = constat ? modeles.find((m) => m.constat === constat) ?? null : null;

  const resetAll = () => {
    setIdLocal(null);
    setIdEquipement(null);
    setConstat("");
    setIdPrestataire(null);
    setDateConstat(todayIso());
  };

  const handleClose = (next: boolean) => {
    if (!next) resetAll();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = constat.trim();
    if (!trimmed) {
      toast.error("Le constat est requis.");
      return;
    }
    try {
      const di = await createDemande.mutateAsync({
        input: {
          id_prestataire: idPrestataire,
          constat: trimmed,
          date_constat: dateConstat,
        },
      });
      if (idLocal) {
        await linkLocalisation.mutateAsync({ idDi: di.id_di, idLocal });
      }
      if (idEquipement) {
        await linkEquipement.mutateAsync({ idDi: di.id_di, idEquipement });
      }
      toast.success("Demande créée");
      handleClose(false);
      navigate(`/demandes/${di.id_di}`);
    } catch { /* géré par useInvokeMutation */ }
  };

  const handleApplyModele = (m: ModeleDi) => {
    setConstat(m.constat);
    if (m.id_equipement) {
      const eq = equipements.find((e) => e.id_equipement === m.id_equipement);
      if (eq) {
        setIdEquipement(eq.id_equipement);
        if (eq.id_local) setIdLocal(eq.id_local);
      }
    }
  };

  const handleClearModele = () => {
    setConstat("");
    setIdLocal(null);
    setIdEquipement(null);
  };

  const prestatairesUtiles = prestataires.filter((p) => p.id_prestataire !== 1);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle demande d'intervention</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Suggestions rapides (modèles) — dropdown */}
          {modeles.length > 0 && (
            <div className="flex items-stretch gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button type="button" variant="outline" className="flex-1 justify-between font-normal">
                      <span className="flex items-center gap-2 min-w-0">
                        <Zap className={appliedModele ? "size-4 text-blue-500" : "size-4 text-muted-foreground"} />
                        <span className={appliedModele ? "truncate" : "text-muted-foreground truncate"}>
                          {appliedModele ? appliedModele.nom_modele : "Suggestions rapides"}
                        </span>
                      </span>
                      <ChevronDown className="size-4 opacity-50" />
                    </Button>
                  }
                />
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  {modeles.map((m) => (
                    <DropdownMenuItem key={m.id_modele_di} onClick={() => handleApplyModele(m)}>
                      {m.nom_modele}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {appliedModele && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={handleClearModele}
                  title="Repasser en saisie manuelle"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          )}

          {/* Lieu + équipement */}
          <LieuEquipementPicker
            idLocal={idLocal}
            idEquipement={idEquipement}
            onChange={(l, e) => { setIdLocal(l); setIdEquipement(e); }}
          />

          {/* Constat unique */}
          <div className="space-y-2">
            <Label>Quoi ? <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Décrivez le problème…"
              value={constat}
              onChange={(e) => setConstat(e.target.value)}
              rows={4}
            />
          </div>

          {/* Prestataire */}
          <div className="space-y-2">
            <Label>Prestataire</Label>
            <div className="flex items-stretch gap-2">
              <Popover open={prestaOpen} onOpenChange={setPrestaOpen}>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" className="flex-1 justify-between font-normal min-h-9">
                      {selectedPrestataire ? (
                        <span className="flex items-center gap-2 min-w-0">
                          <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{selectedPrestataire.libelle}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sélectionner un prestataire…</span>
                      )}
                      <ChevronDown className="size-4 opacity-50 shrink-0" />
                    </Button>
                  }
                />
                <PopoverContent className="w-(--anchor-width) p-0" align="start" sideOffset={4}>
                  <Command>
                    <CommandInput placeholder="Filtrer les prestataires…" autoFocus />
                    <CommandList className="max-h-72">
                      <CommandEmpty>Aucun prestataire.</CommandEmpty>
                      <CommandGroup>
                        {prestatairesUtiles.map((p) => (
                          <CommandItem
                            key={p.id_prestataire}
                            value={p.libelle}
                            onSelect={() => { setIdPrestataire(p.id_prestataire); setPrestaOpen(false); }}
                          >
                            <Briefcase className="size-4 text-muted-foreground" />
                            <span className="truncate">{p.libelle}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {idPrestataire && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setIdPrestataire(null)}
                  title="Effacer le prestataire"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Date du constat */}
          <div className="space-y-2">
            <Label>Date du constat</Label>
            <Input type="date" value={dateConstat} onChange={(e) => setDateConstat(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>Annuler</Button>
            <Button type="submit" disabled={createDemande.isPending}>Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
