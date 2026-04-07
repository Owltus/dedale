import { useState, useMemo, useEffect } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Blocks, Pencil, Plus, Trash2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CardList } from "@/components/shared/CardList";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { modeleEquipementSchema } from "@/lib/schemas/equipements";
import {
  useCategoriesModeles, useUpdateCategorieModele, useDeleteCategorieModele,
  useModelesEquipements, useCreateModeleEquipement,
} from "@/hooks/use-modeles-equipements";
import { formatDate } from "@/lib/utils/format";
import type { ModeleEquipement } from "@/lib/types/equipements";
import type { ModelesOutletContext } from "@/pages/modeles/index";

function filterModele(r: ModeleEquipement, q: string): boolean {
  return r.nom_modele.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || false;
}

export function CategorieModeleDetail() {
  const navigate = useNavigate();
  const { idCategorie } = useParams<{ idCategorie: string }>();
  const categorieId = Number(idCategorie);
  const { setDetailTitle, setDetailActions } = useOutletContext<ModelesOutletContext>();

  const { data: categories = [] } = useCategoriesModeles();
  const { data: allModeles = [] } = useModelesEquipements();
  const createModele = useCreateModeleEquipement();
  const updateCategorie = useUpdateCategorieModele();
  const deleteCategorie = useDeleteCategorieModele();

  const categorie = categories.find((c) => c.id_categorie === categorieId);
  const modeles = useMemo(
    () => allModeles.filter((m) => m.id_categorie === categorieId).sort((a, b) => a.nom_modele.localeCompare(b.nom_modele)),
    [allModeles, categorieId],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editNom, setEditNom] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const form = useForm({
    resolver: zodResolver(modeleEquipementSchema),
    defaultValues: { nom_modele: "", description: "", id_categorie: categorieId },
  });

  const openCreateModele = () => {
    form.reset({ nom_modele: "", description: "", id_categorie: categorieId });
    setDialogOpen(true);
  };

  const onSubmitModele = async (data: Record<string, unknown>) => {
    try {
      await createModele.mutateAsync({ input: data } as never);
      toast.success("Modèle créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const openEditCategorie = () => {
    if (!categorie) return;
    setEditNom(categorie.nom_categorie);
    setEditDesc(categorie.description ?? "");
    setEditOpen(true);
  };

  const onSubmitEdit = async () => {
    try {
      await updateCategorie.mutateAsync({
        id: categorieId,
        input: { nom_categorie: editNom.trim(), description: editDesc.trim() || undefined },
      } as never);
      toast.success("Catégorie modifiée");
      setEditOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  // Remonter titre + boutons dans le header du layout parent
  useEffect(() => {
    if (categorie) {
      setDetailTitle(categorie.nom_categorie);
      setDetailActions(
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Nouveau modèle" onClick={openCreateModele} />
          <HeaderButton icon={<Pencil className="size-4" />} label="Modifier la catégorie" onClick={openEditCategorie} />
          {modeles.length === 0 && (
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer la catégorie" onClick={() => setConfirmDelete(true)} variant="destructive" />
          )}
        </TooltipProvider>,
      );
    }
    return () => { setDetailTitle(null); setDetailActions(null); };
  }, [categorie, modeles.length, setDetailTitle, setDetailActions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!categorie) return <p className="text-sm text-destructive">Catégorie non trouvée.</p>;

  return (
    <>
      <CardList
        data={modeles}
        getKey={(r) => r.id_modele_equipement}
        getHref={(r) => `/modeles/equipements/${r.id_modele_equipement}`}
        filterFn={filterModele}
        icon={<Blocks className="size-5 text-muted-foreground" />}
        title="Modèles"
        emptyTitle="Aucun modèle"
        emptyDescription="Créez un modèle via le bouton ci-dessus."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.nom_modele}</p>
            <p className="text-xs text-muted-foreground truncate">
              {r.nb_champs} champ{r.nb_champs > 1 ? "s" : ""} · {r.nb_familles} famille{r.nb_familles > 1 ? "s" : ""}
            </p>
          </div>
        )}
        renderRight={(r) => (
          <span className="text-xs text-muted-foreground shrink-0">{formatDate(r.date_creation)}</span>
        )}
      />

      {/* Dialog nouveau modèle */}
      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau modèle"
        onSubmit={form.handleSubmit(onSubmitModele)}
        submitLabel="Créer"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom_modele">Nom *</Label>
            <Input id="nom_modele" {...form.register("nom_modele")} />
            {form.formState.errors.nom_modele && (
              <p className="text-sm text-destructive">{String(form.formState.errors.nom_modele.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register("description")} />
          </div>
        </div>
      </CrudDialog>

      {/* Dialog modifier catégorie */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier la catégorie</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={editNom} onChange={(e) => setEditNom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button onClick={onSubmitEdit}>Enregistrer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog suppression catégorie */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cette catégorie ?"
        description={`La catégorie « ${categorie.nom_categorie} » sera supprimée.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteCategorie.mutateAsync({ id: categorieId } as never);
            toast.success("Catégorie supprimée");
            navigate("/modeles/equipements");
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </>
  );
}
