import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { OtList } from "@/components/shared/OtList";
import { GammeList } from "@/components/shared/GammeList";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { useFamilleGamme, useUpdateFamilleGamme, useDeleteFamilleGamme, useDomaineGamme } from "@/hooks/use-gammes";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { useGammes, useCreateGamme } from "@/hooks/use-gammes";
import { useOtByFamille } from "@/hooks/use-ordres-travail";
import { usePrestataires } from "@/hooks/use-prestataires";
import { usePeriodicites } from "@/hooks/use-referentiels";
import { gammeSchema, type GammeFormData } from "@/lib/schemas/gammes";

export function GammesFamille() {
  const navigate = useNavigate();
  const { idFamille } = useParams<{ idFamille: string }>();
  const familleId = Number(idFamille);

  const { data: famille } = useFamilleGamme(familleId);
  const { data: domaine } = useDomaineGamme(famille?.id_domaine_gamme ?? 0);
  const { data: gammes = [], isLoading: loadingGammes } = useGammes(familleId);
  const { data: ots = [] } = useOtByFamille(familleId);
  const { data: prestataires = [] } = usePrestataires();
  const { data: periodicites = [] } = usePeriodicites();
  const createGamme = useCreateGamme();
  const updateFamille = useUpdateFamilleGamme();
  const deleteFamille = useDeleteFamilleGamme();
  const [editFamilleOpen, setEditFamilleOpen] = useState(false);
  const [confirmDeleteFamille, setConfirmDeleteFamille] = useState(false);
  const [editFamilleNom, setEditFamilleNom] = useState("");
  const [editFamilleDesc, setEditFamilleDesc] = useState("");
  const [editFamilleImage, setEditFamilleImage] = useState<number | null>(null);

  useSetBreadcrumbTrail(domaine && famille ? [
    { label: "Gammes", path: "/gammes" },
    { label: domaine.nom_domaine, path: `/gammes/domaines/${famille.id_domaine_gamme}` },
    { label: famille.nom_famille, path: `/gammes/familles/${idFamille}` },
  ] : []);

  const openEditFamille = () => {
    if (!famille) return;
    setEditFamilleNom(famille.nom_famille);
    setEditFamilleDesc(famille.description ?? "");
    setEditFamilleImage(famille.id_image);
    setEditFamilleOpen(true);
  };

  const onSubmitEditFamille = async () => {
    if (!famille) return;
    try {
      await updateFamille.mutateAsync({ id: familleId, input: {
        nom_famille: editFamilleNom.trim(),
        description: editFamilleDesc.trim() || null,
        id_domaine_gamme: famille.id_domaine_gamme,
        id_image: editFamilleImage,
      } } as never);
      toast.success("Famille modifiée");
      setEditFamilleOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<GammeFormData>({
    resolver: typedResolver(gammeSchema),
    defaultValues: {
      nom_gamme: "", description: "", est_reglementaire: 0,
      id_periodicite: 0, id_famille_gamme: familleId, id_prestataire: 1,
      id_image: null,
    },
  });

  const openCreate = () => {
    form.reset({
      nom_gamme: "", description: "", est_reglementaire: 0,
      id_periodicite: 0, id_famille_gamme: familleId, id_prestataire: 1,
      id_image: null,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createGamme.mutateAsync({ input: data } as never);
      toast.success("Gamme créée");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={famille?.nom_famille ?? "Famille"}>
        <div className="flex items-center gap-2">
          <TooltipProvider delay={300}>
            <HeaderButton icon={<Plus className="size-4" />} label="Créer une gamme" onClick={openCreate} />
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier la famille" onClick={openEditFamille} />
            {!loadingGammes && gammes.length === 0 && (
              <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer la famille" onClick={() => setConfirmDeleteFamille(true)} variant="destructive" />
            )}
          </TooltipProvider>
        </div>
      </PageHeader>

      <GammeList
        data={gammes}
        showSearch={false}
        className="max-h-[50%] flex-initial"
        emptyTitle="Aucune gamme"
        emptyDescription="Créez une gamme via le bouton ci-dessus."
      />

      <OtList
        data={ots}
        showSearch={false}
        showDateRange={false}
        emptyTitle="Aucun ordre de travail"
        emptyDescription="Les OT apparaîtront ici quand vous en créerez depuis une gamme."
      />

      {/* Dialog création gamme */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer une gamme</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex gap-6">
              <ImagePicker value={form.watch("id_image") ?? null} onChange={(v) => form.setValue("id_image", v)} />
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nom_gamme">Nom *</Label>
                  <Input id="nom_gamme" {...form.register("nom_gamme")} />
                  {form.formState.errors.nom_gamme && (
                    <p className="text-sm text-destructive">{String(form.formState.errors.nom_gamme.message)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" {...form.register("description")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="id_periodicite">Périodicité *</Label>
                  <Select value={form.watch("id_periodicite") ? String(form.watch("id_periodicite")) : undefined} onValueChange={(v) => form.setValue("id_periodicite", Number(v))} items={Object.fromEntries(periodicites.map(p => [String(p.id_periodicite), p.libelle]))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="— Sélectionner —" /></SelectTrigger>
                    <SelectContent>
                      {periodicites.map((p) => <SelectItem key={p.id_periodicite} value={String(p.id_periodicite)}>{p.libelle}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="id_prestataire">Prestataire *</Label>
                  <Select value={String(form.watch("id_prestataire") ?? 1)} onValueChange={(v) => form.setValue("id_prestataire", Number(v))} items={Object.fromEntries(prestataires.map(p => [String(p.id_prestataire), p.libelle]))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {prestataires.map((p) => <SelectItem key={p.id_prestataire} value={String(p.id_prestataire)}>{p.libelle}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="est_reglementaire" checked={form.watch("est_reglementaire") === 1}
                    onCheckedChange={(v) => form.setValue("est_reglementaire", v ? 1 : 0)} />
                  <Label htmlFor="est_reglementaire">Réglementaire</Label>
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

      {/* Confirmation suppression famille */}
      <ConfirmDialog
        open={confirmDeleteFamille}
        onOpenChange={setConfirmDeleteFamille}
        title="Supprimer cette famille ?"
        description={`La famille « ${famille?.nom_famille} » sera supprimée. Impossible si des équipements ou gammes y sont rattachés.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteFamille.mutateAsync({ id: familleId } as never);
            toast.success("Famille supprimée");
            navigate(`/gammes/domaines/${famille?.id_domaine_gamme}`);
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteFamille(false);
        }}
      />

      {/* Dialog édition famille */}
      <Dialog open={editFamilleOpen} onOpenChange={setEditFamilleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la famille</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-6">
              <ImagePicker value={editFamilleImage} onChange={setEditFamilleImage} />
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input value={editFamilleNom} onChange={(e) => setEditFamilleNom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={editFamilleDesc} onChange={(e) => setEditFamilleDesc(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditFamilleOpen(false)}>Annuler</Button>
              <Button onClick={onSubmitEditFamille}>Enregistrer</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
