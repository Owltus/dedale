import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categorieModeleSchema } from "@/lib/schemas/equipements";
import { useCategoriesModeles, useCreateCategorieModele, useModelesEquipements } from "@/hooks/use-modeles-equipements";
import type { CategorieModele } from "@/lib/types/equipements";
import type { ModelesOutletContext } from "./index";

interface CategorieWithCount extends CategorieModele {
  nb_modeles: number;
}

function filterCategorie(c: CategorieWithCount, q: string): boolean {
  return c.nom_categorie.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || false;
}

export function EquipementsTab() {
  const { addSignal } = useOutletContext<ModelesOutletContext>();
  const { data: categories = [] } = useCategoriesModeles();
  const { data: modeles = [] } = useModelesEquipements();
  const createCategorie = useCreateCategorieModele();

  const [dialogOpen, setDialogOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(categorieModeleSchema),
    defaultValues: { nom_categorie: "", description: "" },
  });

  // Réagir au signal "+" du header parent → créer une catégorie
  const [lastSignal, setLastSignal] = useState(0);
  if (addSignal > 0 && addSignal !== lastSignal) {
    setLastSignal(addSignal);
    form.reset({ nom_categorie: "", description: "" });
    setDialogOpen(true);
  }

  // Enrichir les catégories avec le nombre de modèles
  const categoriesWithCount: CategorieWithCount[] = useMemo(() =>
    categories.map((c) => ({
      ...c,
      nb_modeles: modeles.filter((m) => m.id_categorie === c.id_categorie).length,
    })),
    [categories, modeles],
  );

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createCategorie.mutateAsync({ input: data } as never);
      toast.success("Catégorie créée");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <>
      <CardList
        data={categoriesWithCount}
        getKey={(c) => c.id_categorie}
        getHref={(c) => `/modeles/equipements/categories/${c.id_categorie}`}
        filterFn={filterCategorie}
        icon={<FolderOpen className="size-5 text-muted-foreground" />}
        title="Catégories"
        emptyTitle="Aucune catégorie"
        emptyDescription="Créez une catégorie pour organiser vos modèles d'équipement."
        renderContent={(c) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{c.nom_categorie}</p>
            <p className="text-xs text-muted-foreground truncate">
              {c.nb_modeles} modèle{c.nb_modeles > 1 ? "s" : ""}
              {c.description ? ` — ${c.description}` : ""}
            </p>
          </div>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouvelle catégorie"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom_categorie">Nom *</Label>
            <Input id="nom_categorie" {...form.register("nom_categorie")} />
            {form.formState.errors.nom_categorie && (
              <p className="text-sm text-destructive">{String(form.formState.errors.nom_categorie.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register("description")} />
          </div>
        </div>
      </CrudDialog>
    </>
  );
}
