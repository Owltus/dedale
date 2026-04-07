import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ModelesOutletContext } from "@/pages/modeles/index";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { InfoCard } from "@/components/shared/InfoCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useModeleDi, useUpdateModeleDi, useDeleteModeleDi } from "@/hooks/use-referentiels";
import { useFamilles, useEquipements } from "@/hooks/use-equipements";


export function ModelesDiDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const modeleId = Number(id);
  const { setDetailTitle, setDetailActions } = useOutletContext<ModelesOutletContext>();

  const { data: modele, isLoading } = useModeleDi(modeleId);
  const { data: familles = [] } = useFamilles();
  const updateModele = useUpdateModeleDi();
  const deleteModele = useDeleteModeleDi();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Champs du formulaire d'édition
  const [formNom, setFormNom] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFamille, setFormFamille] = useState<number | null>(null);
  const [formEquipement, setFormEquipement] = useState<number | null>(null);
  const { data: equipementsFamille = [] } = useEquipements(formFamille ?? undefined);
  const [formLibelleConstat, setFormLibelleConstat] = useState("");
  const [formDescConstat, setFormDescConstat] = useState("");
  const [formDescResolution, setFormDescResolution] = useState("");

  const openEdit = () => {
    if (!modele) return;
    setFormNom(modele.nom_modele);
    setFormDesc(modele.description ?? "");
    setFormFamille(modele.id_famille ?? null);
    setFormEquipement(modele.id_equipement ?? null);
    setFormLibelleConstat(modele.libelle_constat);
    setFormDescConstat(modele.description_constat);
    setFormDescResolution(modele.description_resolution ?? "");
    setEditOpen(true);
  };

  const onSubmitEdit = async () => {
    if (!formNom.trim()) { toast.error("Le nom est requis"); return; }
    if (!formLibelleConstat.trim()) { toast.error("Le libellé du constat est requis"); return; }
    if (!formDescConstat.trim()) { toast.error("La description du constat est requise"); return; }

    try {
      await updateModele.mutateAsync({
        id: modeleId,
        input: {
          nom_modele: formNom.trim(),
          description: formDesc.trim() || undefined,
          id_famille: formFamille || undefined,
          id_equipement: formEquipement || undefined,
          libelle_constat: formLibelleConstat.trim(),
          description_constat: formDescConstat.trim(),
          description_resolution: formDescResolution.trim() || undefined,
        },
      } as never);
      toast.success("Modèle modifié");
      setEditOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  // Remonter titre + boutons dans le header du layout
  useEffect(() => {
    if (modele) {
      setDetailTitle(modele.nom_modele);
      setDetailActions(
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le modèle" onClick={openEdit} />
          <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le modèle" onClick={() => setConfirmDelete(true)} variant="destructive" />
        </TooltipProvider>,
      );
    }
    return () => { setDetailTitle(null); setDetailActions(null); };
  }, [modele, setDetailTitle, setDetailActions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement...</p>;
  if (!modele) return <p className="text-sm text-destructive">Modèle non trouvé.</p>;

  const familleLabel = modele.id_famille ? familles.find(f => f.id_famille === modele.id_famille)?.nom_famille : null;
  const equipementLabel = modele.id_equipement ? equipementsFamille.find(e => e.id_equipement === modele.id_equipement)?.nom_affichage ?? modele.nom_equipement : null;

  return (
    <>
      {/* Fiche récapitulative */}
      <InfoCard items={[
        familleLabel ? { label: "Famille d'équipement", value: familleLabel } : null,
        equipementLabel ? { label: "Équipement ciblé", value: equipementLabel } : null,
        modele.description ? { label: "Description", value: modele.description } : null,
      ]} />

      {/* Constat pré-rempli */}
      <Card className="shrink-0">
        <CardContent className="py-3 px-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Libellé du constat</p>
          <p className="text-sm">{modele.libelle_constat}</p>
          <p className="text-xs font-medium text-muted-foreground pt-2">Description du constat</p>
          <p className="text-sm">{modele.description_constat}</p>
          {modele.description_resolution && (
            <>
              <p className="text-xs font-medium text-muted-foreground pt-2">Résolution suggérée</p>
              <p className="text-sm">{modele.description_resolution}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog édition */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le modèle</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); onSubmitEdit(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_nom">Nom du modèle *</Label>
              <Input id="edit_nom" value={formNom} onChange={(e) => setFormNom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_desc">Description</Label>
              <Input id="edit_desc" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            {familles.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="edit_famille">Famille d'équipement</Label>
                <Select value={formFamille ? String(formFamille) : undefined} items={Object.fromEntries(familles.map((f) => [String(f.id_famille), f.nom_famille]))} onValueChange={(v) => { setFormFamille(v ? Number(v) : null); setFormEquipement(null); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="— Aucune (optionnel) —" /></SelectTrigger>
                  <SelectContent>
                    {familles.map((f) => (
                      <SelectItem key={f.id_famille} value={String(f.id_famille)}>{f.nom_famille}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formFamille && equipementsFamille.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="edit_equipement">Équipement précis</Label>
                <Select value={formEquipement ? String(formEquipement) : undefined} items={Object.fromEntries(equipementsFamille.map((e) => [String(e.id_equipement), e.nom_affichage]))} onValueChange={(v) => setFormEquipement(v ? Number(v) : null)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="— Tous (optionnel) —" /></SelectTrigger>
                  <SelectContent>
                    {equipementsFamille.map((e) => (
                      <SelectItem key={e.id_equipement} value={String(e.id_equipement)}>{e.nom_affichage}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit_libelle_constat">Libellé du constat *</Label>
              <Input id="edit_libelle_constat" value={formLibelleConstat} onChange={(e) => setFormLibelleConstat(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_desc_constat">Description du constat *</Label>
              <Textarea id="edit_desc_constat" value={formDescConstat} onChange={(e) => setFormDescConstat(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_resolution">Résolution suggérée</Label>
              <Textarea id="edit_resolution" value={formDescResolution} onChange={(e) => setFormDescResolution(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button type="submit">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce modèle ?"
        description={`Le modèle « ${modele.nom_modele} » sera supprimé définitivement.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteModele.mutateAsync({ id: modeleId } as never);
            toast.success("Modèle supprimé");
            navigate("/modeles/di");
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </>
  );
}
