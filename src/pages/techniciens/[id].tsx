import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { FileUp, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { InfoCard } from "@/components/shared/InfoCard";
import { OtList } from "@/components/shared/OtList";
import { DocumentsLies } from "@/components/shared/DocumentsLies";
import { useDocumentsForEntity } from "@/hooks/use-documents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { technicienSchema, type TechnicienFormData } from "@/lib/schemas/techniciens";

import {
  useTechnicien, useUpdateTechnicien, useDeleteTechnicien, useOtByTechnicien,
} from "@/hooks/use-techniciens";
import { usePostes } from "@/hooks/use-referentiels";

export function TechnicienDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const technicienId = Number(id);

  const { data: technicien } = useTechnicien(technicienId);
  const { data: ots = [] } = useOtByTechnicien(technicienId);
  const { data: docs = [] } = useDocumentsForEntity("techniciens", technicienId);
  const { data: postes = [] } = usePostes();
  const updateTechnicien = useUpdateTechnicien();
  const deleteTechnicien = useDeleteTechnicien();

  const [activeTab, setActiveTab] = useState("ordres-travail");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const posteLabel = postes.find(p => p.id_poste === technicien?.id_poste)?.libelle ?? null;

  const form = useForm<TechnicienFormData>({
    resolver: typedResolver(technicienSchema),
    defaultValues: { nom: "", prenom: "", telephone: "", email: "", id_poste: null, est_actif: 1, id_image: null },
  });

  const openEdit = () => {
    if (!technicien) return;
    form.reset({
      nom: technicien.nom,
      prenom: technicien.prenom,
      telephone: technicien.telephone ?? "",
      email: technicien.email ?? "",
      id_poste: technicien.id_poste,
      est_actif: technicien.est_actif,
      id_image: technicien.id_image,
    });
    setEditOpen(true);
  };

  const onSubmitEdit = async (data: Record<string, unknown>) => {
    try {
      await updateTechnicien.mutateAsync({ id: technicienId, input: data } as never);
      toast.success("Technicien modifié");
      setEditOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title={technicien ? `${technicien.nom} ${technicien.prenom}` : "Technicien"}>
        <div className="flex items-center gap-2">
          {technicien && !technicien.est_actif && (
            <Badge variant="secondary">Inactif</Badge>
          )}
          <TooltipProvider delay={300}>
            {activeTab === "documents" && (
              <HeaderButton icon={<FileUp className="size-4" />} label="Ajouter un document" onClick={() => document.getElementById("tech-doc-upload")?.click()} />
            )}
            <HeaderButton icon={<Pencil className="size-4" />} label="Modifier le technicien" onClick={openEdit} />
            <HeaderButton icon={<Trash2 className="size-4" />} label="Supprimer le technicien" onClick={() => setConfirmDelete(true)} variant="destructive" />
          </TooltipProvider>
        </div>
      </PageHeader>

      <InfoCard imageId={technicien?.id_image} items={[
        { label: "Poste", value: posteLabel },
        { label: "Téléphone", value: technicien?.telephone },
        { label: "Email", value: technicien?.email },
      ]} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="ordres-travail" className="flex-1">Ordres de travail ({ots.length})</TabsTrigger>
          <TabsTrigger value="documents" className="flex-1">Documents ({docs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ordres-travail" className="mt-2 flex flex-1 flex-col min-h-0">
          <OtList
            data={ots}
            emptyTitle="Aucun ordre de travail"
            emptyDescription="Aucun OT n'est assigné à ce technicien."
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-2 flex flex-1 flex-col overflow-y-auto no-scrollbar min-h-0">
          <DocumentsLies entityType="techniciens" entityId={technicienId} inputId="tech-doc-upload" hideAddButton
            namingContext={{}} />
        </TabsContent>
      </Tabs>

      <CrudDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Modifier le technicien"
        onSubmit={form.handleSubmit(onSubmitEdit)}
      >
        <div className="flex gap-6">
          <ImagePicker
            value={form.watch("id_image") ?? null}
            onChange={(v) => form.setValue("id_image", v)}
          />
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom *</Label>
                <Input id="nom" {...form.register("nom")} />
                {form.formState.errors.nom && <p className="text-sm text-destructive">{String(form.formState.errors.nom.message)}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="prenom">Prénom *</Label>
                <Input id="prenom" {...form.register("prenom")} />
                {form.formState.errors.prenom && <p className="text-sm text-destructive">{String(form.formState.errors.prenom.message)}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input id="telephone" {...form.register("telephone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email && <p className="text-sm text-destructive">{String(form.formState.errors.email.message)}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="id_poste">Poste</Label>
              <Select value={form.watch("id_poste") ? String(form.watch("id_poste")) : undefined} items={Object.fromEntries(postes.map(p => [String(p.id_poste), p.libelle]))} onValueChange={(v) => form.setValue("id_poste", v ? Number(v) : null)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— Aucun —" /></SelectTrigger>
                <SelectContent>
                  {postes.map((p) => <SelectItem key={p.id_poste} value={String(p.id_poste)}>{p.libelle}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="est_actif" checked={form.watch("est_actif") === 1}
                onCheckedChange={(checked) => form.setValue("est_actif", checked ? 1 : 0)} />
              <Label htmlFor="est_actif">Actif</Label>
            </div>
          </div>
        </div>
      </CrudDialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce technicien ?"
        description={`Le technicien « ${technicien?.nom} ${technicien?.prenom} » sera supprimé. Les OT assignés garderont son nom en snapshot.`}
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={async () => {
          try {
            await deleteTechnicien.mutateAsync({ id: technicienId } as never);
            toast.success("Technicien supprimé");
            navigate("/techniciens");
          } catch (e) { toast.error(String(e)); }
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
