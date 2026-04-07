import { useState } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Plus, UserCog } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionButtons } from "@/components/shared/ActionButtons";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { technicienSchema, type TechnicienFormData } from "@/lib/schemas/techniciens";
import type { Technicien } from "@/lib/types/techniciens";
import {
  useTechniciens,
  useCreateTechnicien,
  useUpdateTechnicien,
  useDeleteTechnicien,
} from "@/hooks/use-techniciens";
import { usePostes } from "@/hooks/use-referentiels";

function filterTechnicien(r: Technicien, q: string): boolean {
  return (
    r.nom.toLowerCase().includes(q) ||
    r.prenom.toLowerCase().includes(q) ||
    r.telephone?.toLowerCase().includes(q) ||
    r.email?.toLowerCase().includes(q) ||
    false
  );
}

export function Techniciens() {
  const { data: techniciens = [] } = useTechniciens();
  const { data: postes = [] } = usePostes();
  const createTechnicien = useCreateTechnicien();
  const updateTechnicien = useUpdateTechnicien();
  const deleteTechnicien = useDeleteTechnicien();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Technicien | null>(null);

  const form = useForm<TechnicienFormData>({
    resolver: typedResolver(technicienSchema),
    defaultValues: { nom: "", prenom: "", telephone: "", email: "", id_poste: null, est_actif: 1, id_image: null },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({ nom: "", prenom: "", telephone: "", email: "", id_poste: null, est_actif: 1, id_image: null });
    setDialogOpen(true);
  };

  const openEdit = (row: Technicien) => {
    setEditingId(row.id_technicien);
    form.reset({
      nom: row.nom, prenom: row.prenom,
      telephone: row.telephone ?? "", email: row.email ?? "",
      id_poste: row.id_poste, est_actif: row.est_actif,
      id_image: row.id_image,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      if (editingId) {
        await updateTechnicien.mutateAsync({ id: editingId, input: data } as never);
        toast.success("Technicien modifié");
      } else {
        await createTechnicien.mutateAsync({ input: data } as never);
        toast.success("Technicien créé");
      }
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTechnicien.mutateAsync({ id: deleteTarget.id_technicien } as never);
      toast.success("Technicien supprimé");
    } catch (e) { toast.error(String(e)); }
    setDeleteTarget(null);
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Techniciens">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un technicien" onClick={openCreate} />
        </TooltipProvider>
      </PageHeader>

      <CardList
        data={techniciens}
        getKey={(r) => r.id_technicien}
        getHref={(r) => `/techniciens/${r.id_technicien}`}
        getImageId={(t) => t.id_image}
        filterFn={filterTechnicien}
        icon={<UserCog className="size-5 text-muted-foreground" />}
        title="Techniciens"
        emptyTitle="Aucun technicien"
        emptyDescription="Créez un technicien pour l'assigner aux ordres de travail."
        cardClassName={(r) => (!r.est_actif ? "opacity-50" : undefined)}
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {r.nom} {r.prenom}
              {!r.est_actif && <Badge variant="secondary" className="ml-2">Inactif</Badge>}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {[postes.find(p => p.id_poste === r.id_poste)?.libelle, r.telephone].filter(Boolean).join(" · ") || "\u00A0"}
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
        title={editingId ? "Modifier le technicien" : "Nouveau technicien"}
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel={editingId ? "Enregistrer" : "Créer"}
      >
        <div className="flex gap-6">
          <ImagePicker value={form.watch("id_image") ?? null} onChange={(v) => form.setValue("id_image", v)} />
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
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Supprimer le technicien"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleteTarget?.nom} ${deleteTarget?.prenom} » ?`}
        onConfirm={onDelete}
      />
    </div>
  );
}
