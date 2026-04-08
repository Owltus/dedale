import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { FileUp, Pencil, Trash2 } from "lucide-react";
import { PageHeader, useSetBreadcrumbTrail } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { InfoCard } from "@/components/shared/InfoCard";
import { OtList } from "@/components/shared/OtList";
import { GammeList } from "@/components/shared/GammeList";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { useDocumentsForEntity } from "@/hooks/use-documents";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocalisationCascadeSelect } from "@/components/shared/LocalisationCascadeSelect";
import { equipementSchema, type EquipementFormData } from "@/lib/schemas/equipements";
import { useEquipement, useFamille, useDomaine, useOtByEquipement, useUpdateEquipement, useDeleteEquipement } from "@/hooks/use-equipements";
import { useEquipementGammes } from "@/hooks/use-gammes";
import { useValeursEquipement, useSaveValeursEquipement } from "@/hooks/use-modeles-equipements";
import { formatDate } from "@/lib/utils/format";
import type { ValeurChampEquipement } from "@/lib/types/equipements";

function formatValeurChamp(vc: ValeurChampEquipement): string {
  if (vc.valeur == null || vc.valeur === "") return "—";
  if (vc.type_champ === "booleen") return vc.valeur === "1" ? "Oui" : "Non";
  if (vc.type_champ === "date") return formatDate(vc.valeur) ?? "—";
  return vc.valeur;
}

export function EquipementDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const equipementId = Number(id);

  const { data: equipement } = useEquipement(equipementId);
  const { data: famille } = useFamille(equipement?.id_famille ?? 0);
  const { data: domaine } = useDomaine(famille?.id_domaine ?? 0);
  const { data: ots = [] } = useOtByEquipement(equipementId);
  const { data: gammes = [] } = useEquipementGammes(equipementId);
  const { data: valeursChamps = [] } = useValeursEquipement(equipementId);
  const { data: docs = [] } = useDocumentsForEntity("equipements", equipementId);
  const updateEquipement = useUpdateEquipement();
  const deleteEquipement = useDeleteEquipement();
  const saveValeurs = useSaveValeursEquipement();

  const [activeTab, setActiveTab] = useState("gammes");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [caracValues, setCaracValues] = useState<Record<number, string>>({});

  const champsActifs = valeursChamps.filter((vc) => vc.est_archive === 0 || vc.valeur);

  const form = useForm<EquipementFormData>({
    resolver: typedResolver(equipementSchema),
    defaultValues: {
      nom_affichage: "",
      date_mise_en_service: "", date_fin_garantie: "",
      id_famille: equipement?.id_famille ?? 0, id_local: null,
      est_actif: 1, commentaires: "", id_image: null,
    },
  });

  useSetBreadcrumbTrail(domaine && famille && equipement ? [
    { label: "Équipements", path: "/equipements" },
    { label: domaine.nom_domaine, path: `/equipements/domaines/${famille.id_domaine}` },
    { label: famille.nom_famille, path: `/equipements/familles/${equipement.id_famille}` },
    { label: equipement.nom_affichage, path: `/equipements/${id}` },
  ] : []);

  const openEdit = () => {
    if (!equipement) return;
    form.reset({
      nom_affichage: equipement.nom_affichage,
      date_mise_en_service: equipement.date_mise_en_service ?? "",
      date_fin_garantie: equipement.date_fin_garantie ?? "",
      id_famille: equipement.id_famille,
      id_local: equipement.id_local,
      est_actif: equipement.est_actif,
      commentaires: equipement.commentaires ?? "",
      id_image: equipement.id_image,
    });
    const values: Record<number, string> = {};
    for (const vc of valeursChamps) {
      values[vc.id_champ] = vc.valeur ?? "";
    }
    setCaracValues(values);
    setEditOpen(true);
  };

  const onSubmitEdit = async (data: Record<string, unknown>) => {
    try {
      await updateEquipement.mutateAsync({ id: equipementId, input: data } as never);
      // Sauvegarder les caractéristiques en même temps
      if (champsActifs.length > 0) {
        const valeurs = champsActifs.map((vc) => ({
          id_champ: vc.id_champ,
          valeur: caracValues[vc.id_champ]?.trim() || null,
        }));
        await saveValeurs.mutateAsync({ idEquipement: equipementId, valeurs } as never);
      }
      toast.success("Équipement modifié");
      setEditOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={equipement?.nom_affichage ?? "Équipement"}>
        <div className="flex items-center gap-2">
          <TooltipProvider delay={300}>
            {activeTab === "documents" && (
              <HeaderButton
                icon={<FileUp className="size-4" />}
                label="Ajouter un document"
                onClick={() => document.getElementById("equip-doc-upload")?.click()}
              />
            )}
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier" onClick={openEdit} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer" onClick={() => setConfirmDelete(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <InfoCard imageId={equipement?.id_image} items={[
        { label: "Famille", value: famille?.nom_famille },
        { label: "Actif", value: equipement?.est_actif === 1 ? "Oui" : "Non" },
        { label: "Mise en service", value: equipement?.date_mise_en_service ? formatDate(equipement.date_mise_en_service) : null },
        { label: "Fin de garantie", value: equipement?.date_fin_garantie ? formatDate(equipement.date_fin_garantie) : null },
        equipement?.commentaires ? { label: "Commentaires", value: equipement.commentaires, span: 2 } : null,
      ]} />

      {champsActifs.length > 0 && (
        <div className="shrink-0 rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Caractéristiques techniques</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 lg:grid-cols-4">
            {champsActifs.map((vc) => (
              <div key={vc.id_champ} className="min-w-0">
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {vc.nom_champ}{vc.unite ? ` (${vc.unite})` : ""}
                </p>
                <p className="text-xs font-medium truncate">
                  {formatValeurChamp(vc)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="gammes" className="flex-1">Gammes ({gammes.length})</TabsTrigger>
          <TabsTrigger value="ordres-travail" className="flex-1">Ordres de travail ({ots.length})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents ({docs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="gammes" className="mt-2 flex flex-1 flex-col min-h-0">
          <GammeList
            data={gammes}
            emptyTitle="Aucune gamme"
            emptyDescription="Liez des gammes à cet équipement pour voir les maintenances associées."
          />
        </TabsContent>

        <TabsContent value="ordres-travail" className="mt-2 flex flex-1 flex-col min-h-0">
          <OtList
            data={ots}
            emptyTitle="Aucun ordre de travail"
            emptyDescription="Les OT sont générés via les gammes associées à cet équipement."
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col min-h-0">
          <DocumentsLies entityType="equipements" entityId={equipementId} inputId="equip-doc-upload" hideAddButton
            namingContext={{ objet: equipement?.nom_affichage }} />
        </TabsContent>
      </Tabs>

      <CrudDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Modifier l'équipement"
        onSubmit={form.handleSubmit(onSubmitEdit)}
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
              <Input id="nom_affichage" {...form.register("nom_affichage")} />
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
            <div className="col-span-2 col-start-2 flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="commentaires">Commentaires</Label>
                <Input id="commentaires" {...form.register("commentaires")} />
              </div>
              <div className="flex items-center gap-2 pb-0.5">
                <Switch id="est_actif" checked={form.watch("est_actif") === 1}
                  onCheckedChange={(checked) => form.setValue("est_actif", checked ? 1 : 0)} />
                <Label htmlFor="est_actif">Actif</Label>
              </div>
            </div>
          </div>
          {champsActifs.length > 0 && (
            <>
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Caractéristiques techniques</p>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                {champsActifs.map((vc) => (
                  <div key={vc.id_champ} className="space-y-2">
                    <Label htmlFor={`champ-${vc.id_champ}`}>
                      {vc.nom_champ}{vc.unite ? ` (${vc.unite})` : ""}{vc.est_obligatoire === 1 ? " *" : ""}
                    </Label>
                    {vc.type_champ === "texte" && (
                      <Input id={`champ-${vc.id_champ}`} value={caracValues[vc.id_champ] ?? ""} onChange={(e) => setCaracValues((p) => ({ ...p, [vc.id_champ]: e.target.value }))} />
                    )}
                    {vc.type_champ === "nombre" && (
                      <Input id={`champ-${vc.id_champ}`} type="number" step="any" value={caracValues[vc.id_champ] ?? ""} onChange={(e) => setCaracValues((p) => ({ ...p, [vc.id_champ]: e.target.value }))} />
                    )}
                    {vc.type_champ === "date" && (
                      <Input id={`champ-${vc.id_champ}`} type="date" value={caracValues[vc.id_champ] ?? ""} onChange={(e) => setCaracValues((p) => ({ ...p, [vc.id_champ]: e.target.value }))} />
                    )}
                    {vc.type_champ === "booleen" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch id={`champ-${vc.id_champ}`} checked={caracValues[vc.id_champ] === "1"} onCheckedChange={(v) => setCaracValues((p) => ({ ...p, [vc.id_champ]: v ? "1" : "0" }))} />
                        <span className="text-sm">{caracValues[vc.id_champ] === "1" ? "Oui" : "Non"}</span>
                      </div>
                    )}
                    {vc.type_champ === "liste" && (
                      <Select value={caracValues[vc.id_champ] || "empty"} items={{ empty: "— Sélectionner —", ...Object.fromEntries((vc.valeurs_possibles ?? "").split("|").filter(Boolean).map((o) => [o, o])) }} onValueChange={(v) => setCaracValues((p) => ({ ...p, [vc.id_champ]: v === "empty" || !v ? "" : v }))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="empty">— Sélectionner —</SelectItem>
                          {(vc.valeurs_possibles ?? "").split("|").filter(Boolean).map((opt) => (
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

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer cet équipement ?"
        description={`L'équipement « ${equipement?.nom_affichage} » sera supprimé. Impossible si des gammes y sont rattachées.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteEquipement.mutateAsync({ id: equipementId } as never);
            toast.success("Équipement supprimé");
            navigate(`/equipements/familles/${equipement?.id_famille}`);
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
