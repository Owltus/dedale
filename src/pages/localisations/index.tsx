import { useState } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { batimentSchema, type BatimentFormData } from "@/lib/schemas/localisations";
import { useBatiments, useCreateBatiment } from "@/hooks/use-localisations";
import type { Batiment } from "@/lib/types/localisations";

function filterBatiment(r: Batiment, q: string): boolean {
  return r.nom.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || false;
}

export function Localisations() {
  const { data: batiments = [] } = useBatiments();
  const createBatiment = useCreateBatiment();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<BatimentFormData>({
    resolver: typedResolver(batimentSchema),
    defaultValues: { nom: "", description: "", id_image: null },
  });

  const openCreate = () => {
    form.reset({ nom: "", description: "", id_image: null });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createBatiment.mutateAsync({ input: data } as never);
      toast.success("Bâtiment créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Localisations">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un bâtiment" onClick={openCreate} />
        </TooltipProvider>
      </PageHeader>

      <CardList
        data={batiments}
        getKey={(r) => r.id_batiment}
        getHref={(r) => `/localisations/batiments/${r.id_batiment}`}
        getImageId={(r) => r.id_image}
        filterFn={filterBatiment}
        icon={<Building2 className="size-5 text-muted-foreground" />}
        title="Bâtiments"
        emptyTitle="Aucun bâtiment"
        emptyDescription="Créez un bâtiment pour organiser vos niveaux et locaux."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.nom}</p>
            <p className="text-xs text-muted-foreground truncate">
              {[r.description, r.surface_totale > 0 ? `${r.surface_totale} m²` : null].filter(Boolean).join(" · ") || "\u00A0"}
            </p>
          </div>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau bâtiment"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
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
          </div>
        </div>
      </CrudDialog>
    </div>
  );
}
