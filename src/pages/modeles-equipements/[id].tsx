import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Blocks, Pencil, Plus, Trash2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ModelesOutletContext } from "@/pages/modeles/index";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CardList } from "@/components/shared/CardList";
import { ActionButtons } from "@/components/shared/ActionButtons";
import { Badge } from "@/components/ui/badge";
import { useModeleEquipement, useChampsModele, useCreateChampModele, useUpdateChampModele, useArchiveChampModele, useDeleteChampModele, useUpdateModeleEquipement, useDeleteModeleEquipement, useCategoriesModeles } from "@/hooks/use-modeles-equipements";

import type { ChampModele } from "@/lib/types/equipements";

const TYPE_LABELS: Record<string, string> = {
  texte: "Texte", nombre: "Nombre", date: "Date", booleen: "Oui / Non", liste: "Liste",
};

function filterChamp(c: ChampModele, q: string): boolean {
  return c.nom_champ.toLowerCase().includes(q) || c.type_champ.toLowerCase().includes(q) || false;
}

export function ModelesEquipementsDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const modeleId = Number(id);
  const { setDetailTitle, setDetailActions } = useOutletContext<ModelesOutletContext>();

  const { data: modele, isLoading } = useModeleEquipement(modeleId);
  const { data: champs = [] } = useChampsModele(modeleId);

  const createChamp = useCreateChampModele();
  const updateChamp = useUpdateChampModele();
  const archiveChamp = useArchiveChampModele();
  const deleteChamp = useDeleteChampModele();
  const updateModele = useUpdateModeleEquipement();
  const deleteModele = useDeleteModeleEquipement();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChampModele | null>(null);

  const { data: categories = [] } = useCategoriesModeles();

  const [editOpen, setEditOpen] = useState(false);
  const [editNom, setEditNom] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCat, setEditCat] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Champ form state
  const [formNom, setFormNom] = useState("");
  const [formType, setFormType] = useState<string>("texte");
  const [formUnite, setFormUnite] = useState("");
  const [formObligatoire, setFormObligatoire] = useState(false);
  const [formValeurs, setFormValeurs] = useState("");
  const [formDefaut, setFormDefaut] = useState("");

  const catItems = Object.fromEntries(categories.map((c) => [String(c.id_categorie), c.nom_categorie]));

  const openEdit = () => {
    if (!modele) return;
    setEditNom(modele.nom_modele);
    setEditDesc(modele.description ?? "");
    setEditCat(modele.id_categorie);
    setEditOpen(true);
  };

  const onSubmitEdit = async () => {
    try {
      await updateModele.mutateAsync({ id: modeleId, input: {
        nom_modele: editNom.trim(),
        description: editDesc.trim() || null,
        id_categorie: editCat,
      } } as never);
      toast.success("Modèle modifié");
      setEditOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const openCreateChamp = () => {
    setEditingId(null);
    setFormNom(""); setFormType("texte"); setFormUnite(""); setFormObligatoire(false); setFormValeurs(""); setFormDefaut("");
    setDialogOpen(true);
  };

  const openEditChamp = (c: ChampModele) => {
    setEditingId(c.id_champ);
    setFormNom(c.nom_champ);
    setFormType(c.type_champ);
    setFormUnite(c.unite ?? "");
    setFormObligatoire(c.est_obligatoire === 1);
    setFormValeurs(c.valeurs_possibles ?? "");
    setFormDefaut(c.valeur_defaut ?? "");
    setDialogOpen(true);
  };

  const onSubmitChamp = async () => {
    if (!formNom.trim()) { toast.error("Le nom du champ est requis"); return; }

    const input: Record<string, unknown> = {
      id_modele_equipement: modeleId,
      nom_champ: formNom.trim(),
      type_champ: formType,
      unite: (formType === "nombre" && formUnite.trim()) ? formUnite.trim() : null,
      est_obligatoire: formObligatoire ? 1 : 0,
      ordre: editingId ? champs.find(c => c.id_champ === editingId)?.ordre ?? champs.length : champs.length,
      valeurs_possibles: (formType === "liste" && formValeurs.trim()) ? formValeurs.trim() : null,
      valeur_defaut: formDefaut.trim() || null,
    };

    try {
      if (editingId) {
        await updateChamp.mutateAsync({ id: editingId, input } as never);
      } else {
        await createChamp.mutateAsync({ input } as never);
      }
      toast.success(editingId ? "Champ modifié" : "Champ ajouté");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const onDeleteChamp = async () => {
    if (!deleteTarget) return;
    try {
      // Tenter la suppression définitive
      await deleteChamp.mutateAsync({ id: deleteTarget.id_champ } as never);
      toast.success("Champ supprimé");
    } catch {
      // Si le champ a des valeurs, archiver à la place
      try {
        await archiveChamp.mutateAsync({ id: deleteTarget.id_champ } as never);
        toast.success("Champ archivé (des équipements l'utilisent)");
      } catch (e2) { toast.error(String(e2)); }
    }
    setDeleteTarget(null);
  };

  // Remonter titre + boutons dans le header du layout
  useEffect(() => {
    if (modele) {
      setDetailTitle(modele.nom_modele);
      setDetailActions(
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un champ" onClick={openCreateChamp} />
          <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le modèle" onClick={openEdit} />
          <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le modèle" onClick={() => setConfirmDelete(true)} variant="destructive" />
        </TooltipProvider>,
      );
    }
    return () => { setDetailTitle(null); setDetailActions(null); };
  }, [modele, setDetailTitle, setDetailActions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement...</p>;
  if (!modele) return <p className="text-sm text-destructive">Modèle non trouvé.</p>;

  return (
    <>
      <CardList
        data={champs}
        getKey={(c) => c.id_champ}
        filterFn={filterChamp}
        icon={<Blocks className="size-5 text-muted-foreground" />}
        title="Champs du modèle"
        emptyTitle="Aucun champ"
        emptyDescription="Ajoutez des champs pour définir les caractéristiques techniques."
        renderContent={(c) => (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{c.nom_champ}</p>
              {c.est_obligatoire === 1 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Requis</Badge>}
              {c.est_archive === 1 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 opacity-50">Archivé</Badge>}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {TYPE_LABELS[c.type_champ] ?? c.type_champ}
              {c.unite ? ` (${c.unite})` : ""}
              {c.valeurs_possibles ? ` — ${c.valeurs_possibles.split("|").join(", ")}` : ""}
              {c.valeur_defaut ? ` · Défaut : ${c.type_champ === "booleen" ? (c.valeur_defaut === "1" ? "Oui" : "Non") : c.valeur_defaut}` : ""}
            </p>
          </div>
        )}
        renderRight={(c) => (
          <ActionButtons onEdit={() => openEditChamp(c)} onDelete={() => setDeleteTarget(c)} />
        )}
      />

      {/* Dialog champ (create/edit) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le champ" : "Nouveau champ"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); onSubmitChamp(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nom_champ">Nom du champ *</Label>
              <Input id="nom_champ" value={formNom} onChange={(e) => setFormNom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type_champ">Type *</Label>
              <Select value={formType} items={TYPE_LABELS} onValueChange={(v) => { if (v) setFormType(v); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formType === "nombre" && (
              <div className="space-y-2">
                <Label htmlFor="unite">Unité</Label>
                <Input id="unite" value={formUnite} onChange={(e) => setFormUnite(e.target.value)} placeholder="kW, kg, bars..." />
              </div>
            )}
            {formType === "liste" && (
              <div className="space-y-2">
                <Label htmlFor="valeurs">Valeurs possibles</Label>
                <Input id="valeurs" value={formValeurs} onChange={(e) => setFormValeurs(e.target.value)} placeholder="Optique|Thermique|Mixte" />
                <p className="text-xs text-muted-foreground">Séparez les valeurs par le caractère |</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="valeur_defaut">Valeur par défaut</Label>
              {formType === "booleen" ? (
                <div className="flex items-center gap-2 pt-1">
                  <Switch id="valeur_defaut" checked={formDefaut === "1"} onCheckedChange={(v) => setFormDefaut(v ? "1" : "0")} />
                  <span className="text-sm">{formDefaut === "1" ? "Oui" : "Non"}</span>
                </div>
              ) : formType === "liste" && formValeurs.trim() ? (
                <Select value={formDefaut || "empty"} items={{ empty: "— Aucune —", ...Object.fromEntries(formValeurs.split("|").filter(Boolean).map((o) => [o, o])) }} onValueChange={(v) => setFormDefaut(!v || v === "empty" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empty">— Aucune —</SelectItem>
                    {formValeurs.split("|").filter(Boolean).map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : formType === "date" ? (
                <Input id="valeur_defaut" type="date" value={formDefaut} onChange={(e) => setFormDefaut(e.target.value)} />
              ) : formType === "nombre" ? (
                <Input id="valeur_defaut" type="number" step="any" value={formDefaut} onChange={(e) => setFormDefaut(e.target.value)} placeholder="Laisser vide si aucune" />
              ) : (
                <Input id="valeur_defaut" value={formDefaut} onChange={(e) => setFormDefaut(e.target.value)} placeholder="Laisser vide si aucune" />
              )}
              <p className="text-xs text-muted-foreground">Pré-rempli lors de la création d'un équipement</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="obligatoire" checked={formObligatoire} onCheckedChange={setFormObligatoire} />
              <Label htmlFor="obligatoire">Champ obligatoire</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit">{editingId ? "Enregistrer" : "Créer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog edit modèle */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le modèle</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={editNom} onChange={(e) => setEditNom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select
                value={editCat ? String(editCat) : "none"}
                items={{ none: "— Aucune —", ...catItems }}
                onValueChange={(v) => setEditCat(v && v !== "none" ? Number(v) : null)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucune —</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id_categorie} value={String(c.id_categorie)}>{c.nom_categorie}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button onClick={onSubmitEdit}>Enregistrer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer le champ"
        description={`Supprimer « ${deleteTarget?.nom_champ} » ? Si des équipements utilisent ce champ, il sera archivé au lieu d'être supprimé.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={onDeleteChamp}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce modèle ?"
        description={`Le modèle « ${modele.nom_modele} » et tous ses champs seront supprimés. Les valeurs des équipements utilisant ce modèle seront perdues.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteModele.mutateAsync({ id: modeleId } as never);
            toast.success("Modèle supprimé");
            navigate("/modeles/equipements");
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </>
  );
}
