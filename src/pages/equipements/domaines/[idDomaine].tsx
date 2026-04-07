import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FamilleEquipList } from "@/components/shared/FamilleEquipList";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { familleSchema, type FamilleFormData } from "@/lib/schemas/equipements";
import { useDomaine, useFamillesEquipList, useCreateFamille, useUpdateDomaine, useDeleteDomaine } from "@/hooks/use-equipements";
import { useModelesEquipements } from "@/hooks/use-modeles-equipements";

export function DomaineDetail() {
  const navigate = useNavigate();
  const { idDomaine } = useParams<{ idDomaine: string }>();
  const domaineId = Number(idDomaine);

  const { data: domaine } = useDomaine(domaineId);
  const { data: familles = [] } = useFamillesEquipList(domaineId);
  const { data: modelesEquipements = [] } = useModelesEquipements();
  const createFamille = useCreateFamille();
  const updateDomaine = useUpdateDomaine();
  const deleteDomaine = useDeleteDomaine();

  useSetBreadcrumbTrail(domaine ? [
    { label: "Équipements", path: "/equipements" },
    { label: domaine.nom_domaine, path: `/equipements/domaines/${idDomaine}` },
  ] : []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDomaineOpen, setEditDomaineOpen] = useState(false);
  const [confirmDeleteDomaine, setConfirmDeleteDomaine] = useState(false);
  const [editNom, setEditNom] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImage, setEditImage] = useState<number | null>(null);

  const form = useForm<FamilleFormData>({
    resolver: typedResolver(familleSchema),
    defaultValues: { nom_famille: "", description: "", id_domaine: domaineId, id_image: null, id_modele_equipement: 0 },
  });

  const openCreate = () => {
    form.reset({ nom_famille: "", description: "", id_domaine: domaineId, id_image: null, id_modele_equipement: 0 });
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
            <HeaderButton icon={<Plus className="size-4" />} label="Ajouter une famille" onClick={openCreate} />
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le domaine" onClick={openEditDomaine} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le domaine" onClick={() => setConfirmDeleteDomaine(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <FamilleEquipList
        data={familles}
        emptyTitle="Aucune famille"
        emptyDescription="Créez une famille pour organiser les équipements de ce domaine."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouvelle famille"
        onSubmit={form.handleSubmit(onSubmitFamille)}
        submitLabel="Créer"
      >
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
            <div className="space-y-2">
              <Label>Modèle d'équipement *</Label>
              <Select
                value={form.watch("id_modele_equipement") ? String(form.watch("id_modele_equipement")) : undefined}
                items={Object.fromEntries(modelesEquipements.map(m => [String(m.id_modele_equipement), `${m.nom_modele} (${m.nb_champs} champ${m.nb_champs > 1 ? "s" : ""})`]))}
                onValueChange={(v) => { if (v) form.setValue("id_modele_equipement", Number(v)); }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
                <SelectContent>
                  {modelesEquipements.map((m) => (
                    <SelectItem key={m.id_modele_equipement} value={String(m.id_modele_equipement)}>
                      {m.nom_modele} ({m.nb_champs} champ{m.nb_champs > 1 ? "s" : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.id_modele_equipement && (
                <p className="text-sm text-destructive">{String(form.formState.errors.id_modele_equipement.message)}</p>
              )}
            </div>
          </div>
        </div>
      </CrudDialog>

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
            navigate("/equipements");
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteDomaine(false);
        }}
      />
    </div>
  );
}
