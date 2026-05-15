import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Briefcase, ChevronDown, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LieuEquipementPicker } from "./LieuEquipementPicker";
import { usePrestataires } from "@/hooks/use-prestataires";
import {
  useUpdateDemande,
  useLinkDiLocalisation,
  useUnlinkDiLocalisation,
  useLinkDiEquipement,
  useUnlinkDiEquipement,
} from "@/hooks/use-demandes";
import type { DemandeIntervention, DiEquipementInfo } from "@/lib/types/demandes";

interface DiEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  di: DemandeIntervention;
  linkedLocalIds: number[];
  linkedEquipements: DiEquipementInfo[];
}

export function DiEditDialog({ open, onOpenChange, di, linkedLocalIds, linkedEquipements }: DiEditDialogProps) {
  const { data: prestataires = [] } = usePrestataires();
  const updateDemande = useUpdateDemande();
  const linkLoc = useLinkDiLocalisation();
  const unlinkLoc = useUnlinkDiLocalisation();
  const linkEquip = useLinkDiEquipement();
  const unlinkEquip = useUnlinkDiEquipement();

  const [constat, setConstat] = useState("");
  const [idPrestataire, setIdPrestataire] = useState<number | null>(null);
  const [dateConstat, setDateConstat] = useState("");
  const [dateResolution, setDateResolution] = useState("");
  const [descriptionResolution, setDescriptionResolution] = useState("");
  const [idLocal, setIdLocal] = useState<number | null>(null);
  const [idEquipement, setIdEquipement] = useState<number | null>(null);
  const [prestaOpen, setPrestaOpen] = useState(false);
  // Valeurs initiales du ciblage : refs car lues uniquement au submit pour
  // détecter un changement — pas besoin de déclencher un re-render.
  const initialLocalIdRef = useRef<number | null>(null);
  const initialEquipIdRef = useRef<number | null>(null);

  // Une DI est "résolue ou réouverte" si son statut n'est pas Ouverte (1).
  // Dans ces deux cas la résolution existe et peut être éditée librement.
  const showResolution = di.id_statut_di !== 1;

  // Pré-remplissage à l'ouverture. Le ciblage est en sélection unique : on
  // initialise avec la première liaison existante. La détection de changement
  // (idLocal vs initialLocalId) évite de toucher aux liaisons multiples
  // préexistantes tant que l'utilisateur ne modifie pas le ciblage.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!open) return;
    const loc0 = linkedLocalIds[0] ?? null;
    const eq0 = linkedEquipements[0]?.id_equipement ?? null;
    setConstat(di.constat);
    setIdPrestataire(di.id_prestataire);
    setDateConstat(di.date_constat);
    setDateResolution(di.date_resolution ?? "");
    setDescriptionResolution(di.description_resolution ?? "");
    setIdLocal(loc0);
    setIdEquipement(eq0);
    initialLocalIdRef.current = loc0;
    initialEquipIdRef.current = eq0;
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const selectedPrestataire = idPrestataire ? prestataires.find((p) => p.id_prestataire === idPrestataire) ?? null : null;
  const prestatairesUtiles = prestataires.filter((p) => p.id_prestataire !== 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = constat.trim();
    if (!trimmed) {
      toast.error("Le constat est requis.");
      return;
    }
    try {
      const input: Record<string, unknown> = {
        id_prestataire: idPrestataire,
        constat: trimmed,
        date_constat: dateConstat,
      };
      if (showResolution) {
        input.description_resolution = descriptionResolution.trim() || null;
        input.date_resolution = dateResolution || null;
      }
      await updateDemande.mutateAsync({ id: di.id_di, input } as never);

      // Synchroniser le lieu uniquement si l'utilisateur l'a changé.
      if (idLocal !== initialLocalIdRef.current) {
        for (const oldId of linkedLocalIds) {
          if (oldId !== idLocal) await unlinkLoc.mutateAsync({ idDi: di.id_di, idLocal: oldId });
        }
        if (idLocal && !linkedLocalIds.includes(idLocal)) {
          await linkLoc.mutateAsync({ idDi: di.id_di, idLocal });
        }
      }
      // Idem pour l'équipement.
      if (idEquipement !== initialEquipIdRef.current) {
        for (const old of linkedEquipements) {
          if (old.id_equipement !== idEquipement) {
            await unlinkEquip.mutateAsync({ idDi: di.id_di, idEquipement: old.id_equipement });
          }
        }
        if (idEquipement && !linkedEquipements.some((e) => e.id_equipement === idEquipement)) {
          await linkEquip.mutateAsync({ idDi: di.id_di, idEquipement });
        }
      }

      toast.success("Demande modifiée");
      onOpenChange(false);
    } catch { /* géré par useInvokeMutation */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la demande</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* Résolution — éditable si la DI a été résolue (statut 2) ou réouverte (3) */}
          {showResolution && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Résolution</p>
              <div className="space-y-2">
                <Label>Date de résolution</Label>
                <Input type="date" value={dateResolution} onChange={(e) => setDateResolution(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description de la résolution</Label>
                <Textarea
                  value={descriptionResolution}
                  onChange={(e) => setDescriptionResolution(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={updateDemande.isPending}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
