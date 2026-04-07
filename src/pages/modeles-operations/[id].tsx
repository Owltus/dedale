import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ModelesOutletContext } from "@/pages/modeles/index";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CardList } from "@/components/shared/CardList";
import { ActionButtons } from "@/components/shared/ActionButtons";
import type { ModeleOperationItem } from "@/lib/types/gammes";
import { useModeleOperation, useModeleOperationItems, useCreateModeleOperationItem, useUpdateModeleOperationItem, useDeleteModeleOperationItem, useUpdateModeleOperation, useDeleteModeleOperation } from "@/hooks/use-modeles-operations";
import { useTypesOperations, useUnites } from "@/hooks/use-referentiels";


function filterItem(item: ModeleOperationItem, q: string): boolean {
  return item.nom_operation.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q) || false;
}

export function ModelesOperationsDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const modeleId = Number(id);
  const { setDetailTitle, setDetailActions } = useOutletContext<ModelesOutletContext>();

  const { data: modele, isLoading } = useModeleOperation(modeleId);
  const { data: items = [] } = useModeleOperationItems(modeleId);
  const { data: typesOps = [] } = useTypesOperations();
  const { data: unites = [] } = useUnites();

  const createItem = useCreateModeleOperationItem();
  const updateItem = useUpdateModeleOperationItem();
  const deleteItem = useDeleteModeleOperationItem();
  const updateModele = useUpdateModeleOperation();
  const deleteModele = useDeleteModeleOperation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModeleOperationItem | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editNom, setEditNom] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImage, setEditImage] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openEdit = () => {
    if (!modele) return;
    setEditNom(modele.nom_modele);
    setEditDesc(modele.description ?? "");
    setEditImage(modele.id_image);
    setEditOpen(true);
  };

  const onSubmitEdit = async () => {
    try {
      await updateModele.mutateAsync({ id: modeleId, input: {
        nom_modele: editNom.trim(),
        description: editDesc.trim() || null,
        id_image: editImage,
      } } as never);
      toast.success("Modèle modifié");
      setEditOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const [formNom, setFormNom] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState(0);
  const [formUnite, setFormUnite] = useState<number | null>(null);
  const [formSeuilMin, setFormSeuilMin] = useState<string>("");
  const [formSeuilMax, setFormSeuilMax] = useState<string>("");

  const selectedTypeOp = typesOps.find((t) => t.id_type_operation === formType);
  const showSeuils = selectedTypeOp?.necessite_seuils === 1;

  const openCreate = () => {
    setEditingId(null);
    setFormNom(""); setFormDesc(""); setFormType(0); setFormUnite(null); setFormSeuilMin(""); setFormSeuilMax("");
    setDialogOpen(true);
  };

  const openEditItem = (item: ModeleOperationItem) => {
    setEditingId(item.id_modele_operation_item);
    setFormNom(item.nom_operation);
    setFormDesc(item.description ?? "");
    setFormType(item.id_type_operation);
    setFormUnite(item.id_unite);
    setFormSeuilMin(item.seuil_minimum !== null ? String(item.seuil_minimum) : "");
    setFormSeuilMax(item.seuil_maximum !== null ? String(item.seuil_maximum) : "");
    setDialogOpen(true);
  };

  const onSubmit = async () => {
    if (!formNom.trim()) { toast.error("Le nom est requis"); return; }
    if (!formType || formType <= 0) { toast.error("Le type d'opération est requis"); return; }

    const input: Record<string, unknown> = {
      nom_operation: formNom.trim(),
      description: formDesc.trim() || null,
      id_type_operation: formType,
      id_modele_operation: modeleId,
      seuil_minimum: showSeuils && formSeuilMin ? Number(formSeuilMin) : null,
      seuil_maximum: showSeuils && formSeuilMax ? Number(formSeuilMax) : null,
      id_unite: showSeuils ? formUnite : null,
    };

    try {
      if (editingId) {
        await updateItem.mutateAsync({ id: editingId, input } as never);
      } else {
        await createItem.mutateAsync({ input } as never);
      }
      toast.success(editingId ? "Item modifié" : "Item ajouté");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem.mutateAsync({ id: deleteTarget.id_modele_operation_item } as never);
      toast.success("Item supprimé");
    } catch (e) { toast.error(String(e)); }
    setDeleteTarget(null);
  };

  // Remonter titre + boutons dans le header du layout
  useEffect(() => {
    if (modele) {
      setDetailTitle(modele.nom_modele);
      setDetailActions(
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Ajouter une opération" onClick={openCreate} />
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
        data={items}
        getKey={(item) => item.id_modele_operation_item}
        filterFn={filterItem}
        icon={<ListChecks className="size-5 text-muted-foreground" />}
        title="Opérations"
        emptyTitle="Aucune opération"
        emptyDescription="Ajoutez des opérations à ce modèle via le bouton ci-dessus."
        renderContent={(item) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.nom_operation}</p>
            <p className="text-xs text-muted-foreground truncate">{item.description ?? "\u00A0"}</p>
          </div>
        )}
        renderRight={(item) => (
          <ActionButtons
            onEdit={() => openEditItem(item)}
            onDelete={() => setDeleteTarget(item)}
          />
        )}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier l'opération" : "Nouvelle opération"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nom_operation">Nom *</Label>
              <Input id="nom_operation" value={formNom} onChange={(e) => setFormNom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="id_type_operation">Type d'opération *</Label>
              <Select value={formType ? String(formType) : undefined} items={Object.fromEntries(typesOps.map(t => [String(t.id_type_operation), t.libelle]))} onValueChange={(v) => { const val = Number(v); setFormType(val); if (!typesOps.find(t => t.id_type_operation === val)?.necessite_seuils) { setFormUnite(null); setFormSeuilMin(""); setFormSeuilMax(""); } }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
                <SelectContent>
                  {typesOps.map((t) => <SelectItem key={t.id_type_operation} value={String(t.id_type_operation)}>{t.libelle}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {showSeuils && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="id_unite">Unité *</Label>
                  <Select value={formUnite ? String(formUnite) : undefined} items={Object.fromEntries(unites.map(u => [String(u.id_unite), `${u.nom} (${u.symbole})`]))} onValueChange={(v) => setFormUnite(v ? Number(v) : null)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
                    <SelectContent>
                      {unites.map((u) => <SelectItem key={u.id_unite} value={String(u.id_unite)}>{u.nom} ({u.symbole})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="seuil_min">Seuil min</Label>
                    <Input id="seuil_min" type="number" step="any" value={formSeuilMin} onChange={(e) => setFormSeuilMin(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seuil_max">Seuil max</Label>
                    <Input id="seuil_max" type="number" step="any" value={formSeuilMax} onChange={(e) => setFormSeuilMax(e.target.value)} />
                  </div>
                </div>
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit">{editingId ? "Enregistrer" : "Créer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer l'opération"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleteTarget?.nom_operation} » ?`}
        onConfirm={onDelete}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le modèle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-6">
              <ImagePicker value={editImage} onChange={setEditImage} />
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input value={editNom} onChange={(e) => setEditNom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button onClick={onSubmitEdit}>Enregistrer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce modèle ?"
        description={`Le modèle « ${modele.nom_modele} » et toutes ses opérations seront supprimés.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteModele.mutateAsync({ id: modeleId } as never);
            toast.success("Modèle supprimé");
            navigate("/modeles/operations");
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </>
  );
}
