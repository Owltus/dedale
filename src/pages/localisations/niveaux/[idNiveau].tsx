import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { ActionButtons } from "@/components/shared/ActionButtons";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localSchema, type LocalFormData } from "@/lib/schemas/localisations";
import {
  useNiveau, useBatiment, useLocaux,
  useCreateLocal, useUpdateLocal, useDeleteLocal,
  useUpdateNiveau, useDeleteNiveau,
} from "@/hooks/use-localisations";
import type { Local } from "@/lib/types/localisations";

function filterLocal(r: Local, q: string): boolean {
  return r.nom.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || false;
}

export function NiveauDetail() {
  const navigate = useNavigate();
  const { idNiveau } = useParams<{ idNiveau: string }>();
  const niveauId = Number(idNiveau);

  const { data: niveau } = useNiveau(niveauId);
  const { data: batiment } = useBatiment(niveau?.id_batiment ?? 0);
  const { data: locaux = [] } = useLocaux(niveauId);
  const createLocal = useCreateLocal();
  const updateLocal = useUpdateLocal();
  const deleteLocal = useDeleteLocal();
  const updateNiveau = useUpdateNiveau();
  const deleteNiveau = useDeleteNiveau();

  useSetBreadcrumbTrail(batiment && niveau ? [
    { label: "Localisations", path: "/localisations" },
    { label: batiment.nom, path: `/localisations/batiments/${niveau.id_batiment}` },
    { label: niveau.nom, path: `/localisations/niveaux/${idNiveau}` },
  ] : []);

  // Local CRUD
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Local | null>(null);

  const form = useForm<LocalFormData>({
    resolver: typedResolver(localSchema),
    defaultValues: { nom: "", description: "", surface: null, id_image: null, id_niveau: niveauId },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({ nom: "", description: "", surface: null, id_image: null, id_niveau: niveauId });
    setDialogOpen(true);
  };

  const openEdit = (row: Local) => {
    setEditingId(row.id_local);
    form.reset({ nom: row.nom, description: row.description ?? "", surface: row.surface, id_image: row.id_image ?? null, id_niveau: niveauId });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      if (editingId) {
        await updateLocal.mutateAsync({ id: editingId, input: data } as never);
        toast.success("Local modifié");
      } else {
        await createLocal.mutateAsync({ input: data } as never);
        toast.success("Local créé");
      }
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const onDeleteLocal = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLocal.mutateAsync({ id: deleteTarget.id_local } as never);
      toast.success("Local supprimé");
    } catch (e) { toast.error(String(e)); }
    setDeleteTarget(null);
  };

  // Niveau edit
  const [editNiveauOpen, setEditNiveauOpen] = useState(false);
  const [editNiveauNom, setEditNiveauNom] = useState("");
  const [editNiveauDesc, setEditNiveauDesc] = useState("");
  const [editNiveauImage, setEditNiveauImage] = useState<number | null>(null);
  const [confirmDeleteNiveau, setConfirmDeleteNiveau] = useState(false);

  const openEditNiveau = () => {
    if (!niveau) return;
    setEditNiveauNom(niveau.nom);
    setEditNiveauDesc(niveau.description ?? "");
    setEditNiveauImage(niveau.id_image ?? null);
    setEditNiveauOpen(true);
  };

  const onSubmitEditNiveau = async () => {
    if (!niveau) return;
    try {
      await updateNiveau.mutateAsync({ id: niveauId, input: {
        nom: editNiveauNom.trim(),
        description: editNiveauDesc.trim() || null,
        id_image: editNiveauImage,
        id_batiment: niveau.id_batiment,
      } } as never);
      toast.success("Niveau modifié");
      setEditNiveauOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={niveau?.nom ?? "Niveau"}>
        <div className="flex items-center gap-2">
          {niveau && niveau.surface_totale > 0 && (
            <span className="text-sm text-muted-foreground">{niveau.surface_totale} m²</span>
          )}
          <TooltipProvider delay={300}>
            <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un local" onClick={openCreate} />
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le niveau" onClick={openEditNiveau} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le niveau" onClick={() => setConfirmDeleteNiveau(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <CardList
        data={locaux}
        getKey={(r) => r.id_local}
        getHref={(r) => `/localisations/locaux/${r.id_local}`}
        getImageId={(r) => r.id_image}
        filterFn={filterLocal}
        icon={<DoorOpen className="size-5 text-muted-foreground" />}
        title="Locaux"
        emptyTitle="Aucun local"
        emptyDescription="Créez un local dans ce niveau."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.nom}</p>
            <p className="text-xs text-muted-foreground truncate">
              {[r.description, r.surface != null ? `${r.surface} m²` : null].filter(Boolean).join(" · ") || "\u00A0"}
            </p>
          </div>
        )}
        renderRight={(r) => (
          <ActionButtons
            onEdit={() => openEdit(r)}
            onDelete={() => setDeleteTarget(r)}
          />
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? "Modifier le local" : "Nouveau local"}
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel={editingId ? "Enregistrer" : "Créer"}
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
            <div className="space-y-2">
              <Label htmlFor="surface">Surface (m²)</Label>
              <Input id="surface" type="number" step="0.01" min="0" {...form.register("surface")} />
            </div>
          </div>
        </div>
      </CrudDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer le local"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleteTarget?.nom} » ? Cette action est irréversible.`}
        onConfirm={onDeleteLocal}
      />

      <Dialog open={editNiveauOpen} onOpenChange={setEditNiveauOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le niveau</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-6">
              <ImagePicker
                value={editNiveauImage}
                onChange={setEditNiveauImage}
              />
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input value={editNiveauNom} onChange={(e) => setEditNiveauNom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={editNiveauDesc} onChange={(e) => setEditNiveauDesc(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditNiveauOpen(false)}>Annuler</Button>
              <Button onClick={onSubmitEditNiveau}>Enregistrer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteNiveau}
        onOpenChange={setConfirmDeleteNiveau}
        title="Supprimer ce niveau ?"
        description={`Le niveau « ${niveau?.nom} » sera supprimé. Impossible si des locaux y sont rattachés.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteNiveau.mutateAsync({ id: niveauId } as never);
            toast.success("Niveau supprimé");
            navigate(`/localisations/batiments/${niveau?.id_batiment}`);
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteNiveau(false);
        }}
      />
    </div>
  );
}
