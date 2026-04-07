import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FamilleGammeList } from "@/components/shared/FamilleGammeList";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { familleGammeSchema, type FamilleGammeFormData } from "@/lib/schemas/gammes";
import { useDomaineGamme, useUpdateDomaineGamme, useDeleteDomaineGamme, useFamillesGammesList, useCreateFamilleGamme } from "@/hooks/use-gammes";

export function GammesDomaine() {
  const navigate = useNavigate();
  const { idDomaine } = useParams<{ idDomaine: string }>();
  const domaineId = Number(idDomaine);

  const { data: domaine } = useDomaineGamme(domaineId);
  const { data: familles = [], isLoading: loadingFamilles } = useFamillesGammesList(domaineId);
  const createFamille = useCreateFamilleGamme();
  const updateDomaine = useUpdateDomaineGamme();
  const deleteDomaine = useDeleteDomaineGamme();

  useSetBreadcrumbTrail(domaine ? [
    { label: "Gammes", path: "/gammes" },
    { label: domaine.nom_domaine, path: `/gammes/domaines/${idDomaine}` },
  ] : []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDomaineOpen, setEditDomaineOpen] = useState(false);
  const [confirmDeleteDomaine, setConfirmDeleteDomaine] = useState(false);
  const [editNom, setEditNom] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImage, setEditImage] = useState<number | null>(null);

  const form = useForm<FamilleGammeFormData>({
    resolver: typedResolver(familleGammeSchema),
    defaultValues: { nom_famille: "", description: "", id_domaine_gamme: domaineId, id_image: null },
  });

  const openCreateFamille = () => {
    form.reset({ nom_famille: "", description: "", id_domaine_gamme: domaineId, id_image: null });
    setDialogOpen(true);
  };

  const onSubmitFamille = async (data: Record<string, unknown>) => {
    try {
      await createFamille.mutateAsync({ input: data } as never);
      toast.success("Famille créée");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const openEditDomaine = () => {
    if (!domaine) return;
    setEditNom(domaine.nom_domaine);
    setEditDesc(domaine.description ?? "");
    setEditImage(domaine.id_image);
    setEditDomaineOpen(true);
  };

  const onSubmitEditDomaine = async () => {
    try {
      await updateDomaine.mutateAsync({ id: domaineId, input: {
        nom_domaine: editNom.trim(),
        description: editDesc.trim() || null,
        id_image: editImage,
      } } as never);
      toast.success("Domaine modifié");
      setEditDomaineOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={domaine?.nom_domaine ?? "Domaine"}>
        <div className="flex items-center gap-2">
          <TooltipProvider delay={300}>
            <HeaderButton icon={<Plus className="size-4" />} label="Ajouter une famille" onClick={openCreateFamille} />
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le domaine" onClick={openEditDomaine} />
            {!loadingFamilles && familles.length === 0 && (
              <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le domaine" onClick={() => setConfirmDeleteDomaine(true)} variant="destructive" />
            )}
          </TooltipProvider>
        </div>
      </PageHeader>

      <FamilleGammeList
        data={familles}
        emptyTitle="Aucune famille"
        emptyDescription="Créez une famille via le bouton ci-dessus."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle famille</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmitFamille)} className="space-y-4">
            <div className="flex gap-6">
              <ImagePicker value={form.watch("id_image") ?? null} onChange={(v) => form.setValue("id_image", v)} />
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nom_famille">Nom *</Label>
                  <Input id="nom_famille" {...form.register("nom_famille")} />
                  {form.formState.errors.nom_famille && (
                    <p className="text-sm text-destructive">{String(form.formState.errors.nom_famille.message)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" {...form.register("description")} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit">Créer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editDomaineOpen} onOpenChange={setEditDomaineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le domaine</DialogTitle>
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
              <Button variant="outline" onClick={() => setEditDomaineOpen(false)}>Annuler</Button>
              <Button onClick={onSubmitEditDomaine}>Enregistrer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteDomaine}
        onOpenChange={setConfirmDeleteDomaine}
        title="Supprimer ce domaine ?"
        description={`Le domaine « ${domaine?.nom_domaine} » sera supprimé. Impossible si des familles y sont rattachées.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteDomaine.mutateAsync({ id: domaineId } as never);
            toast.success("Domaine supprimé");
            navigate("/gammes");
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteDomaine(false);
        }}
      />
    </div>
  );
}
