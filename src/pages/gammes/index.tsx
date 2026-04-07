import { useState } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { DomaineGammeList } from "@/components/shared/DomaineGammeList";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { domaineGammeSchema, type DomaineGammeFormData } from "@/lib/schemas/gammes";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { useDomainesGammesList, useCreateDomaineGamme } from "@/hooks/use-gammes";

export function GammesList() {
  const { data: domaines = [] } = useDomainesGammesList();
  const createDomaine = useCreateDomaineGamme();

  const [dialogOpen, setDialogOpen] = useState(false);
  const form = useForm<DomaineGammeFormData>({
    resolver: typedResolver(domaineGammeSchema),
    defaultValues: { nom_domaine: "", description: "", id_image: null },
  });

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createDomaine.mutateAsync({ input: data } as never);
      toast.success("Domaine créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Gammes">
        <div className="flex items-center gap-2">
          <TooltipProvider delay={300}>
            <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un domaine" onClick={() => { form.reset(); setDialogOpen(true); }} />
          </TooltipProvider>
        </div>
      </PageHeader>

      <DomaineGammeList
        data={domaines}
        emptyTitle="Aucun domaine"
        emptyDescription="Créez un domaine pour organiser vos gammes de maintenance."
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
