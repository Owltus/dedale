import { useState } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { DomaineEquipList } from "@/components/shared/DomaineEquipList";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { domaineSchema, type DomaineFormData } from "@/lib/schemas/equipements";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { useDomainesEquipList, useCreateDomaine } from "@/hooks/use-equipements";

export function Equipements() {
  const { data: domaines = [] } = useDomainesEquipList();
  const createDomaine = useCreateDomaine();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<DomaineFormData>({
    resolver: typedResolver(domaineSchema),
    defaultValues: { nom_domaine: "", description: "", id_image: null },
  });

  const openCreate = () => {
    form.reset({ nom_domaine: "", description: "", id_image: null });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createDomaine.mutateAsync({ input: data } as never);
      toast.success("Domaine créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Équipements">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un domaine" onClick={openCreate} />
        </TooltipProvider>
      </PageHeader>

      <DomaineEquipList
        data={domaines}
        emptyTitle="Aucun domaine technique"
        emptyDescription="Créez un domaine pour organiser vos familles d'équipements."
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau domaine"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        <div className="flex gap-6">
          <ImagePicker value={form.watch("id_image") ?? null} onChange={(v) => form.setValue("id_image", v)} />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nom_domaine">Nom *</Label>
              <Input id="nom_domaine" {...form.register("nom_domaine")} />
              {form.formState.errors.nom_domaine && (
                <p className="text-sm text-destructive">{String(form.formState.errors.nom_domaine.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...form.register("description")} />
            </div>
          </div>
        </div>
      </CrudDialog>
    </div>
  );
}
