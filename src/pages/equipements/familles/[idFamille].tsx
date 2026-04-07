import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { EquipementList } from "@/components/shared/EquipementList";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { equipementSchema, type EquipementFormData } from "@/lib/schemas/equipements";
import { useDomaine, useFamille, useEquipementsList, useCreateEquipement, useUpdateFamille, useDeleteFamille } from "@/hooks/use-equipements";
import { useModelesEquipements, useChampsModele, useSaveValeursEquipement } from "@/hooks/use-modeles-equipements";
import { LocalisationCascadeSelect } from "@/components/shared/LocalisationCascadeSelect";
import type { Equipement } from "@/lib/types/equipements";

export function FamilleDetail() {
  const navigate = useNavigate();
  const { idFamille } = useParams<{ idFamille: string }>();
  const familleId = Number(idFamille);

  const { data: famille } = useFamille(familleId);
  const { data: domaine } = useDomaine(famille?.id_domaine ?? 0);
  const { data: equipements = [] } = useEquipementsList(familleId);
  const { data: modelesEquipements = [] } = useModelesEquipements();
  const { data: champsModele = [] } = useChampsModele(famille?.id_modele_equipement ?? 0);
  const createEquipement = useCreateEquipement();
  const saveValeurs = useSaveValeursEquipement();
  const updateFamille = useUpdateFamille();
  const deleteFamille = useDeleteFamille();

  useSetBreadcrumbTrail(domaine && famille ? [
    { label: "Équipements", path: "/equipements" },
    { label: domaine.nom_domaine, path: `/equipements/domaines/${famille.id_domaine}` },
    { label: famille.nom_famille, path: `/equipements/familles/${idFamille}` },
  ] : []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFamilleOpen, setEditFamilleOpen] = useState(false);
  const [confirmDeleteFamille, setConfirmDeleteFamille] = useState(false);
  const [caracValues, setCaracValues] = useState<Record<number, string>>({});
  const [editNom, setEditNom] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImage, setEditImage] = useState<number | null>(null);
  const [editModele, setEditModele] = useState<number>(0);

  const emptyDefaults = {
    nom_affichage: "",
    date_mise_en_service: "", date_fin_garantie: "",
    id_famille: familleId, id_local: null,
    est_actif: 1, commentaires: "", id_image: null,
  };

  const form = useForm<EquipementFormData>({
    resolver: typedResolver(equipementSchema),
    defaultValues: emptyDefaults,
  });

  const openCreate = () => {
    form.reset(emptyDefaults);
    // Pré-remplir avec les valeurs par défaut du modèle
    const defaults: Record<number, string> = {};
    for (const c of champsModele) {
      if (c.valeur_defaut && c.est_archive === 0) {
        defaults[c.id_champ] = c.valeur_defaut;
      }
    }
    setCaracValues(defaults);
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      const created = await createEquipement.mutateAsync({ input: data } as never) as Equipement;
      // Sauvegarder les valeurs personnalisées si le modèle a des champs
      if (champsModele.length > 0) {
        const valeurs = champsModele.map((c) => ({
          id_champ: c.id_champ,
          valeur: caracValues[c.id_champ]?.trim() || null,
        })).filter((v) => v.valeur !== null);
        if (valeurs.length > 0) {
          await saveValeurs.mutateAsync({ idEquipement: created.id_equipement, valeurs } as never);
        }
      }
      toast.success("Équipement créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const openEditFamille = () => {
    if (!famille) return;
    setEditNom(famille.nom_famille);
    setEditDesc(famille.description ?? "");
    setEditImage(famille.id_image);
    setEditModele(famille.id_modele_equipement);
    setEditFamilleOpen(true);
  };

  const onSubmitEditFamille = async () => {
    if (!famille) return;
    try {
      await updateFamille.mutateAsync({ id: familleId, input: {
        nom_famille: editNom.trim(),
        description: editDesc.trim() || null,
        id_domaine: famille.id_domaine,
        id_image: editImage,
        id_modele_equipement: editModele,
      } } as never);
      toast.success("Famille modifiée");
      setEditFamilleOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={famille?.nom_famille ?? "Famille"}>
        <div className="flex items-center gap-2">
          <TooltipProvider delay={300}>
            <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un équipement" onClick={openCreate} />
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier la famille" onClick={openEditFamille} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer la famille" onClick={() => setConfirmDeleteFamille(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <EquipementList
        data={equipements}
        emptyTitle="Aucun équipement"
        emptyDescription="Créez un équipement dans cette famille."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouvel équipement"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
        className="sm:max-w-2xl"
      >
        <div className="space-y-4">
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Informations générales</p>
          </div>
          <div className="grid grid-cols-3 grid-rows-[auto_auto_auto] gap-4">
            <div className="row-span-3 flex items-center justify-center">
              <ImagePicker value={form.watch("id_image") ?? null} onChange={(v) => form.setValue("id_image", v)} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="nom_affichage">Désignation *</Label>
              <Input id="nom_affichage" {...form.register("nom_affichage")} placeholder="Nom de l'équipement" />
              {form.formState.errors.nom_affichage && (
                <p className="text-sm text-destructive">{String(form.formState.errors.nom_affichage.message)}</p>
              )}
            </div>
            <div className="space-y-3">
              <LocalisationCascadeSelect
                value={form.watch("id_local") ?? null}
                onChange={(v) => form.setValue("id_local", v)}
                labels={{ batiment: "Bâtiment", niveau: "Niveau", local: "Local" }}
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="date_mise_en_service">Mise en service</Label>
                <Input id="date_mise_en_service" type="date" {...form.register("date_mise_en_service")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_fin_garantie">Fin de garantie</Label>
                <Input id="date_fin_garantie" type="date" {...form.register("date_fin_garantie")} />
                {form.formState.errors.date_fin_garantie && (
                  <p className="text-sm text-destructive">{String(form.formState.errors.date_fin_garantie.message)}</p>
                )}
              </div>
            </div>
            <div className="col-span-2 col-start-2 space-y-2">
              <Label htmlFor="commentaires">Commentaires</Label>
              <Input id="commentaires" {...form.register("commentaires")} />
            </div>
          </div>
          {champsModele.filter((c) => c.est_archive === 0).length > 0 && (
            <>
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Caractéristiques techniques</p>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                {champsModele.filter((c) => c.est_archive === 0).map((c) => (
                  <div key={c.id_champ} className="space-y-2">
                    <Label htmlFor={`c-${c.id_champ}`}>
                      {c.nom_champ}{c.unite ? ` (${c.unite})` : ""}{c.est_obligatoire === 1 ? " *" : ""}
                    </Label>
                    {c.type_champ === "texte" && (
                      <Input id={`c-${c.id_champ}`} value={caracValues[c.id_champ] ?? ""} onChange={(e) => setCaracValues((p) => ({ ...p, [c.id_champ]: e.target.value }))} />
                    )}
                    {c.type_champ === "nombre" && (
                      <Input id={`c-${c.id_champ}`} type="number" step="any" value={caracValues[c.id_champ] ?? ""} onChange={(e) => setCaracValues((p) => ({ ...p, [c.id_champ]: e.target.value }))} />
                    )}
                    {c.type_champ === "date" && (
                      <Input id={`c-${c.id_champ}`} type="date" value={caracValues[c.id_champ] ?? ""} onChange={(e) => setCaracValues((p) => ({ ...p, [c.id_champ]: e.target.value }))} />
                    )}
                    {c.type_champ === "booleen" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch id={`c-${c.id_champ}`} checked={caracValues[c.id_champ] === "1"} onCheckedChange={(v) => setCaracValues((p) => ({ ...p, [c.id_champ]: v ? "1" : "0" }))} />
                        <span className="text-sm">{caracValues[c.id_champ] === "1" ? "Oui" : "Non"}</span>
                      </div>
                    )}
                    {c.type_champ === "liste" && (
                      <Select value={caracValues[c.id_champ] || "empty"} items={{ empty: "— Sélectionner —", ...Object.fromEntries((c.valeurs_possibles ?? "").split("|").filter(Boolean).map((o) => [o, o])) }} onValueChange={(v) => setCaracValues((p) => ({ ...p, [c.id_champ]: v === "empty" || !v ? "" : v }))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="empty">— Sélectionner —</SelectItem>
                          {(c.valeurs_possibles ?? "").split("|").filter(Boolean).map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CrudDialog>

      <Dialog open={editFamilleOpen} onOpenChange={setEditFamilleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la famille</DialogTitle>
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
                <div className="space-y-2">
                  <Label>Modèle d'équipement</Label>
                  <Select
                    value={editModele ? String(editModele) : undefined}
                    items={Object.fromEntries(modelesEquipements.map(m => [String(m.id_modele_equipement), `${m.nom_modele} (${m.nb_champs} champ${m.nb_champs > 1 ? "s" : ""})`]))}
                    onValueChange={(v) => { if (v) setEditModele(Number(v)); }}
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

      <ConfirmDialog
        open={confirmDeleteFamille}
        onOpenChange={setConfirmDeleteFamille}
        title="Supprimer cette famille ?"
        description={`La famille « ${famille?.nom_famille} » sera supprimée. Impossible si des équipements y sont rattachés.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteFamille.mutateAsync({ id: familleId } as never);
            toast.success("Famille supprimée");
            navigate(`/equipements/domaines/${famille?.id_domaine}`);
          } catch (e) { toast.error(String(e)); }
          setConfirmDeleteFamille(false);
        }}
      />
    </div>
  );
}
