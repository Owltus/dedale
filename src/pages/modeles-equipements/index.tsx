import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Blocks, Plus, FolderOpen, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { modeleEquipementSchema, categorieModeleSchema } from "@/lib/schemas/equipements";
import {
  useModelesEquipements, useCreateModeleEquipement,
  useCategoriesModeles, useCreateCategorieModele, useUpdateCategorieModele, useDeleteCategorieModele,
} from "@/hooks/use-modeles-equipements";
import { formatDate } from "@/lib/utils/format";
import type { ModeleEquipement, CategorieModele } from "@/lib/types/equipements";

// ── Composant carte modèle (réutilisé dans chaque section) ──
function ModeleCard({ modele }: { modele: ModeleEquipement }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-stretch rounded-lg border overflow-hidden cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => navigate(`/modeles-equipements/${modele.id_modele_equipement}`)}
    >
      <div className="flex w-12 shrink-0 items-center justify-center bg-muted border-r">
        <Blocks className="size-4 text-muted-foreground" />
      </div>
      <div className="flex flex-1 items-center justify-between gap-6 px-4 py-2.5 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{modele.nom_modele}</p>
          <p className="text-xs text-muted-foreground truncate">
            {modele.nb_champs} champ{modele.nb_champs > 1 ? "s" : ""} · {modele.nb_familles} famille{modele.nb_familles > 1 ? "s" : ""}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formatDate(modele.date_creation)}</span>
      </div>
    </div>
  );
}

// ��─ Section catégorie (dépliable) ──
function CategorieSection({
  categorie,
  modeles,
  onEdit,
  onDelete,
}: {
  categorie: CategorieModele | null;
  modeles: ModeleEquipement[];
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const label = categorie?.nom_categorie ?? "Non classé";

  return (
    <div className="rounded-lg border">
      <button
        className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        <FolderOpen className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">({modeles.length})</span>
        {categorie && (
          <span className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-2 pb-2">
          {modeles.map((m) => (
            <ModeleCard key={m.id_modele_equipement} modele={m} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ModelesEquipementsList() {
  const { data: modeles = [] } = useModelesEquipements();
  const { data: categories = [] } = useCategoriesModeles();
  const createModeleMut = useCreateModeleEquipement();
  const createCategorieMut = useCreateCategorieModele();
  const updateCategorieMut = useUpdateCategorieModele();
  const deleteCategorieMut = useDeleteCategorieModele();

  const [modeleDialogOpen, setModeleDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<CategorieModele | null>(null);
  const [deletingCat, setDeletingCat] = useState<CategorieModele | null>(null);

  const modeleForm = useForm({
    resolver: typedResolver(modeleEquipementSchema),
    defaultValues: { nom_modele: "", description: "", id_categorie: null as number | null },
  });

  const catForm = useForm({
    resolver: typedResolver(categorieModeleSchema),
    defaultValues: { nom_categorie: "", description: "" },
  });

  // Regroupement par catégorie
  const grouped = useMemo(() => {
    const groups: { categorie: CategorieModele | null; modeles: ModeleEquipement[] }[] = [];
    // Catégories existantes dans l'ordre
    for (const cat of categories) {
      groups.push({
        categorie: cat,
        modeles: modeles
          .filter((m) => m.id_categorie === cat.id_categorie)
          .sort((a, b) => a.nom_modele.localeCompare(b.nom_modele)),
      });
    }
    // Modèles sans catégorie
    const unclassified = modeles
      .filter((m) => !m.id_categorie)
      .sort((a, b) => a.nom_modele.localeCompare(b.nom_modele));
    if (unclassified.length > 0) {
      groups.push({ categorie: null, modeles: unclassified });
    }
    return groups;
  }, [modeles, categories]);

  // Items pour le Select catégorie dans le formulaire modèle
  const catItems = useMemo(
    () => Object.fromEntries(categories.map((c) => [String(c.id_categorie), c.nom_categorie])),
    [categories],
  );

  // ── Handlers modèle ──
  const openCreateModele = () => {
    modeleForm.reset({ nom_modele: "", description: "", id_categorie: null });
    setModeleDialogOpen(true);
  };
  const onSubmitModele = async (data: Record<string, unknown>) => {
    try {
      await createModeleMut.mutateAsync({ input: data } as never);
      toast.success("Modèle créé");
      setModeleDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  // ── Handlers catégorie ──
  const openCreateCat = () => {
    setEditingCat(null);
    catForm.reset({ nom_categorie: "", description: "" });
    setCatDialogOpen(true);
  };
  const openEditCat = (cat: CategorieModele) => {
    setEditingCat(cat);
    catForm.reset({ nom_categorie: cat.nom_categorie, description: cat.description ?? "" });
    setCatDialogOpen(true);
  };
  const onSubmitCat = async (data: Record<string, unknown>) => {
    try {
      if (editingCat) {
        await updateCategorieMut.mutateAsync({ id: editingCat.id_categorie, input: data } as never);
        toast.success("Catégorie modifiée");
      } else {
        await createCategorieMut.mutateAsync({ input: data } as never);
        toast.success("Catégorie créée");
      }
      setCatDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };
  const onDeleteCat = async () => {
    if (!deletingCat) return;
    try {
      await deleteCategorieMut.mutateAsync({ id: deletingCat.id_categorie });
      toast.success("Catégorie supprimée");
      setDeletingCat(null);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Modèles d'équipement">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<FolderOpen className="size-4" />} label="Nouvelle catégorie" onClick={openCreateCat} />
          <HeaderButton icon={<Plus className="size-4" />} label="Nouveau modèle" onClick={openCreateModele} />
        </TooltipProvider>
      </PageHeader>

      {modeles.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border">
          <EmptyState
            title="Aucun modèle"
            description="Créez un modèle pour définir des champs personnalisés par type d'équipement."
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto no-scrollbar">
          {grouped.map((g) => (
            <CategorieSection
              key={g.categorie?.id_categorie ?? "none"}
              categorie={g.categorie}
              modeles={g.modeles}
              onEdit={g.categorie ? () => openEditCat(g.categorie!) : undefined}
              onDelete={g.categorie ? () => setDeletingCat(g.categorie) : undefined}
            />
          ))}
        </div>
      )}

      {/* Dialog modèle */}
      <CrudDialog
        open={modeleDialogOpen}
        onOpenChange={setModeleDialogOpen}
        title="Nouveau modèle"
        onSubmit={modeleForm.handleSubmit(onSubmitModele)}
        submitLabel="Créer"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom_modele">Nom *</Label>
            <Input id="nom_modele" {...modeleForm.register("nom_modele")} />
            {modeleForm.formState.errors.nom_modele && (
              <p className="text-sm text-destructive">{String(modeleForm.formState.errors.nom_modele.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...modeleForm.register("description")} />
          </div>
          <div className="space-y-2">
            <Label>Catégorie</Label>
            <Select
              value={modeleForm.watch("id_categorie") ? String(modeleForm.watch("id_categorie")) : undefined}
              items={catItems}
              onValueChange={(v) => modeleForm.setValue("id_categorie", v ? Number(v) : null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucune cat��gorie" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id_categorie} value={String(c.id_categorie)}>
                    {c.nom_categorie}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CrudDialog>

      {/* Dialog catégorie */}
      <CrudDialog
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        title={editingCat ? "Modifier la catégorie" : "Nouvelle catégorie"}
        onSubmit={catForm.handleSubmit(onSubmitCat)}
        submitLabel={editingCat ? "Enregistrer" : "Créer"}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom_categorie">Nom *</Label>
            <Input id="nom_categorie" {...catForm.register("nom_categorie")} />
            {catForm.formState.errors.nom_categorie && (
              <p className="text-sm text-destructive">{String(catForm.formState.errors.nom_categorie.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat_description">Description</Label>
            <Input id="cat_description" {...catForm.register("description")} />
          </div>
        </div>
      </CrudDialog>

      {/* Dialog suppression catégorie */}
      <ConfirmDialog
        open={!!deletingCat}
        onOpenChange={(o) => !o && setDeletingCat(null)}
        title="Supprimer la catégorie"
        description={`��tes-vous sûr de vouloir supprimer « ${deletingCat?.nom_categorie} » ? Les modèles de cette catégorie deviendront non classés.`}
        onConfirm={onDeleteCat}
      />
    </div>
  );
}
