import { useState } from "react";
import { toast } from "sonner";
import { Link } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFamilles } from "@/hooks/use-equipements";
import type { Equipement } from "@/lib/types/equipements";

export interface EquipementLinkDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gammeId: number;
  linkedEquipements: Equipement[];
  allEquipements: Equipement[];
  linkMutation: { mutateAsync: (args: never) => Promise<unknown> };
  batchLinkMutation: { mutateAsync: (args: never) => Promise<unknown> };
}

export function EquipementLinkDialog({ open, onOpenChange, gammeId, linkedEquipements, allEquipements, linkMutation, batchLinkMutation }: EquipementLinkDialogProps) {
  const { data: familles = [] } = useFamilles();
  const [selectedFamille, setSelectedFamille] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const linkedIds = new Set(linkedEquipements.map((e) => e.id_equipement));
  const familleMap = new Map(familles.map((f) => [f.id_famille, f.nom_famille]));

  // Familles qui ont au moins un équipement non lié
  const famillesAvailable = familles.filter((f) =>
    allEquipements.some((eq) => eq.id_famille === f.id_famille && !linkedIds.has(eq.id_equipement))
  );

  // Équipements filtrés par famille sélectionnée + recherche
  const filtered = allEquipements.filter((eq) => {
    if (linkedIds.has(eq.id_equipement)) return false;
    if (selectedFamille && eq.id_famille !== selectedFamille) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return eq.nom_affichage.toLowerCase().includes(q);
    }
    return true;
  });

  const linkOne = async (idEquipement: number, nom: string) => {
    try {
      await linkMutation.mutateAsync({ idGamme: gammeId, idEquipement } as never);
      toast.success(`${nom} lié`);
    } catch (e) { toast.error(String(e)); }
  };

  const linkAllFiltered = async () => {
    try {
      await batchLinkMutation.mutateAsync({ idGamme: gammeId, idEquipements: filtered.map((e) => e.id_equipement) } as never);
      toast.success(`${filtered.length} équipement(s) lié(s)`);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelectedFamille(null); setSearch(""); } }}>
      <DialogContent className="flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lier des équipements</DialogTitle>
        </DialogHeader>

        {/* Filtres */}
        <div className="flex gap-2">
          <Select value={selectedFamille ? String(selectedFamille) : undefined} items={Object.fromEntries(famillesAvailable.map(f => [String(f.id_famille), f.nom_famille]))} onValueChange={(v) => setSelectedFamille(v ? Number(v) : null)}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Toutes les familles" /></SelectTrigger>
            <SelectContent>
              {famillesAvailable.map((f) => (
                <SelectItem key={f.id_famille} value={String(f.id_famille)}>{f.nom_famille}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
        </div>

        {/* Bouton lier tout */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{filtered.length} équipement(s) disponible(s)</span>
            <Button size="sm" variant="secondary" onClick={linkAllFiltered}>
              <Link className="size-3 mr-1" /> Lier tous ({filtered.length})
            </Button>
          </div>
        )}

        {/* Liste */}
        <div className="overflow-y-auto space-y-1 max-h-[40vh]">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aucun équipement disponible.</p>
          ) : (
            filtered.map((eq) => (
              <div key={eq.id_equipement} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{eq.nom_affichage}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {familleMap.get(eq.id_famille)}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => linkOne(eq.id_equipement, eq.nom_affichage)}>
                  <Link className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
