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
import { EquipementList } from "@/components/shared/EquipementList";
import { GammeList } from "@/components/shared/GammeList";
import { OtList } from "@/components/shared/OtList";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { useDocumentsForEntity } from "@/hooks/use-documents";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localSchema, type LocalFormData } from "@/lib/schemas/localisations";
import {
  useLocal, useNiveau, useBatiment,
  useUpdateLocal, useDeleteLocal,
  useEquipementsByLocal, useGammesByLocal, useOtByLocal,
} from "@/hooks/use-localisations";

export function LocalDetail() {
  const navigate = useNavigate();
  const { idLocal } = useParams<{ idLocal: string }>();
  const localId = Number(idLocal);

  const { data: local } = useLocal(localId);
  const { data: niveau } = useNiveau(local?.id_niveau ?? 0);
  const { data: batiment } = useBatiment(niveau?.id_batiment ?? 0);
  const { data: equipements = [] } = useEquipementsByLocal(localId);
  const { data: gammes = [] } = useGammesByLocal(localId);
  const { data: ots = [] } = useOtByLocal(localId);
  const { data: docs = [] } = useDocumentsForEntity("localisations", localId);
  const updateLocal = useUpdateLocal();
  const deleteLocal = useDeleteLocal();

  const [activeTab, setActiveTab] = useState("equipements");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useSetBreadcrumbTrail(batiment && niveau && local ? [
    { label: "Localisations", path: "/localisations" },
    { label: batiment.nom, path: `/localisations/batiments/${niveau.id_batiment}` },
    { label: niveau.nom, path: `/localisations/niveaux/${local.id_niveau}` },
    { label: local.nom, path: `/localisations/locaux/${idLocal}` },
  ] : []);

  const form = useForm<LocalFormData>({
    resolver: typedResolver(localSchema),
    defaultValues: { nom: "", description: "", surface: null, id_image: null, id_niveau: localId },
  });

  const openEdit = () => {
    if (!local) return;
    form.reset({
      nom: local.nom,
      description: local.description ?? "",
      surface: local.surface,
      id_image: local.id_image ?? null,
      id_niveau: local.id_niveau,
    });
    setEditOpen(true);
  };

  const onSubmitEdit = async (data: Record<string, unknown>) => {
    try {
      await updateLocal.mutateAsync({ id: localId, input: data } as never);
      toast.success("Local modifié");
      setEditOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={local?.nom ?? "Local"}>
        <div className="flex items-center gap-2">
          <TooltipProvider delay={300}>
            {activeTab === "documents" && (
              <HeaderButton icon={<FileUp className="size-4" />} label="Ajouter un document" onClick={() => document.getElementById("local-doc-upload")?.click()} />
            )}
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le local" onClick={openEdit} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le local" onClick={() => setConfirmDelete(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <InfoCard imageId={local?.id_image} items={[
        { label: "Bâtiment", value: batiment?.nom },
        { label: "Niveau", value: niveau?.nom },
        { label: "Surface", value: local?.surface != null ? `${local.surface} m²` : null },
        { label: "Description", value: local?.description },
      ]} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="equipements" className="flex-1">Équipements ({equipements.length})</TabsTrigger>
          <TabsTrigger value="gammes" className="flex-1">Gammes ({gammes.length})</TabsTrigger>
          <TabsTrigger value="ordres-travail" className="flex-1">Ordres de travail ({ots.length})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents ({docs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="equipements" className="mt-2 flex flex-1 flex-col min-h-0">
          <EquipementList
            data={equipements}
            emptyTitle="Aucun équipement"
            emptyDescription="Aucun équipement n'est installé dans ce local."
          />
        </TabsContent>

        <TabsContent value="gammes" className="mt-2 flex flex-1 flex-col min-h-0">
          <GammeList
            data={gammes}
            emptyTitle="Aucune gamme"
            emptyDescription="Aucune gamme de maintenance n'est liée à ce local."
          />
        </TabsContent>

        <TabsContent value="ordres-travail" className="mt-2 flex flex-1 flex-col min-h-0">
          <OtList
            data={ots}
            emptyTitle="Aucun ordre de travail"
            emptyDescription="Aucun OT n'est lié aux gammes de ce local."
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col overflow-y-auto no-scrollbar min-h-0">
          <DocumentsLies entityType="localisations" entityId={localId} inputId="local-doc-upload" hideAddButton
            namingContext={{ objet: local?.nom }} />
        </TabsContent>
      </Tabs>

      <CrudDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Modifier le local"
        onSubmit={form.handleSubmit(onSubmitEdit)}
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
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce local ?"
        description={`Le local « ${local?.nom} » sera supprimé. Impossible si des équipements y sont rattachés.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteLocal.mutateAsync({ id: localId } as never);
            toast.success("Local supprimé");
            navigate(`/localisations/niveaux/${local?.id_niveau}`);
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
