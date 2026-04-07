import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { niveauSchema, type NiveauFormData } from "@/lib/schemas/localisations";
import {
  useBatiment, useNiveaux,
  useCreateNiveau,
  useUpdateBatiment, useDeleteBatiment,
} from "@/hooks/use-localisations";
import type { Niveau } from "@/lib/types/localisations";

function filterNiveau(r: Niveau, q: string): boolean {
  return r.nom.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || false;
}

export function BatimentDetail() {
  const navigate = useNavigate();
  const { idBatiment } = useParams<{ idBatiment: string }>();
  const batimentId = Number(idBatiment);

  const { data: batiment } = useBatiment(batimentId);
  const { data: niveaux = [] } = useNiveaux(batimentId);
  const createNiveau = useCreateNiveau();
  const updateBatiment = useUpdateBatiment();
  const deleteBatiment = useDeleteBatiment();

  useSetBreadcrumbTrail(batiment ? [
    { label: "Localisations", path: "/localisations" },
    { label: batiment.nom, path: `/localisations/batiments/${idBatiment}` },
  ] : []);

  // Niveau création
  const [dialogOpen, setDialogOpen] = useState(false);
  const form = useForm<NiveauFormData>({
    resolver: typedResolver(niveauSchema),
    defaultValues: { nom: "", description: "", id_image: null, id_batiment: batimentId },
  });

  const openCreate = () => {
    form.reset({ nom: "", description: "", id_image: null, id_batiment: batimentId });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createNiveau.mutateAsync({ input: data } as never);
      toast.success("Niveau créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  // Bâtiment edit
  const [editBatimentOpen, setEditBatimentOpen] = useState(false);
  const [editBatimentNom, setEditBatimentNom] = useState("");
  const [editBatimentDesc, setEditBatimentDesc] = useState("");
  const [editBatimentImage, setEditBatimentImage] = useState<number | null>(null);
  const [confirmDeleteBatiment, setConfirmDeleteBatiment] = useState(false);

  const openEditBatiment = () => {
    if (!batiment) return;
    setEditBatimentNom(batiment.nom);
    setEditBatimentDesc(batiment.description ?? "");
    setEditBatimentImage(batiment.id_image ?? null);
    setEditBatimentOpen(true);
  };

  const onSubmitEditBatiment = async () => {
    if (!batiment) return;
    try {
      await updateBatiment.mutateAsync({ id: batimentId, input: {
        nom: editBatimentNom.trim(),
        description: editBatimentDesc.trim() || null,
        id_image: editBatimentImage,
      } } as never);
      toast.success("Bâtiment modifié");
      setEditBatimentOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={batiment?.nom ?? "Bâtiment"}>
        <div className="flex items-center gap-2">
          {batiment && batiment.surface_totale > 0 && (
            <span className="text-sm text-muted-foreground">{batiment.surface_totale} m²</span>
          )}
          <TooltipProvider delay={300}>
            <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un niveau" onClick={openCreate} />
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le bâtiment" onClick={openEditBatiment} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le bâtiment" onClick={() => setConfirmDeleteBatiment(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <CardList
        data={niveaux}
        getKey={(r) => r.id_niveau}
        getHref={(r) => `/localisations/niveaux/${r.id_niveau}`}
        getImageId={(r) => r.id_image}
        filterFn={filterNiveau}
        icon={<Layers className="size-5 text-muted-foreground" />}
        title="Niveaux"
        emptyTitle="Aucun niveau"
        emptyDescription="Créez un niveau pour organiser les locaux de ce bâtiment."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.nom}</p>
            <p className="text-xs text-muted-foreground truncate">
              {[r.description, r.surface_totale > 0 ? `${r.surface_totale} m²` : null].filter(Boolean).join(" · ") || "\u00A0"}
            </p>
          </div>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau niveau"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        <div className="flex gap-6">
          <ImagePicker
            value={form.watch("id_image") ?? null}
            onChange={(v) => form.setValue("id_image", v)}
          />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom *</Label>
              <Input id="nom" {...form.register("nom")} />
              {form.formState.errors.nom && (
                <p className="text-sm text-destructive">{String(form.formState.errors.nom.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...form.register("description")} />
            </div>
          </div>
        </div>
      </CrudDialog>

      {/* Dialog édition bâtiment */}
      <Dialog open={editBatimentOpen} onOpenChange={setEditBatimentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le bâtiment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-6">
              <ImagePicker
                value={editBatimentImage}
                onChange={setEditBatimentImage}
              />
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input value={editBatimentNom} onChange={(e) => setEditBatimentNom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={editBatimentDesc} onChange={(e) => setEditBatimentDesc(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditBatimentOpen(false)}>Annuler</Button>
              <Button onClick={onSubmitEditBatiment}>Enregistrer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteBatiment}
        onOpenChange={setConfirmDeleteBatiment}
        title="Supprimer ce bâtiment ?"
        description={`Le bâtiment « ${batiment?.nom} » sera supprimé. Impossible si des niveaux y sont rattachés.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteBatiment.mutateAsync({ id: batimentId } as never);
            toast.success("Bâtiment supprimé");
            navigate("/localisations");
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteBatiment(false);
        }}
      />
    </div>
  );
}
