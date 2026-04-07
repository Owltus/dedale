import { useState } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { BookOpen, Plus } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { modeleOperationSchema, type ModeleOperationFormData } from "@/lib/schemas/gammes";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { useModelesOperations, useCreateModeleOperation } from "@/hooks/use-modeles-operations";
import { formatDate } from "@/lib/utils/format";
import type { ModeleOperation } from "@/lib/types/gammes";

function filterModeleOperation(r: ModeleOperation, q: string): boolean {
  return r.nom_modele.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || false;
}

export function ModelesOperationsList() {
  const { data: modeles = [] } = useModelesOperations();
  const createMutation = useCreateModeleOperation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<ModeleOperationFormData>({
    resolver: typedResolver(modeleOperationSchema),
    defaultValues: { nom_modele: "", description: "", id_image: null },
  });

  const openCreate = () => {
    form.reset({ nom_modele: "", description: "", id_image: null });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createMutation.mutateAsync({ input: data } as never);
      toast.success("Modèle créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Modèles d'opérations">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Créer un modèle" onClick={openCreate} />
        </TooltipProvider>
      </PageHeader>

      <CardList
        data={modeles}
        getKey={(r) => r.id_modele_operation}
        getHref={(r) => `/modeles-operations/${r.id_modele_operation}`}
        getImageId={(m) => m.id_image}
        filterFn={filterModeleOperation}
        icon={<BookOpen className="size-5 text-muted-foreground" />}
        title="Modèles"
        emptyTitle="Aucun modèle"
        emptyDescription="Créez un modèle pour définir des opérations réutilisables."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.nom_modele}</p>
            <p className="text-xs text-muted-foreground truncate">{r.description ?? "\u00A0"}</p>
          </div>
        )}
        renderRight={(r) => (
          <span className="text-xs text-muted-foreground shrink-0">{formatDate(r.date_creation)}</span>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau modèle"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        <div className="flex gap-6">
          <ImagePicker value={form.watch("id_image") ?? null} onChange={(v) => form.setValue("id_image", v)} />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nom_modele">Nom *</Label>
              <Input id="nom_modele" {...form.register("nom_modele")} />
              {form.formState.errors.nom_modele && (
                <p className="text-sm text-destructive">{String(form.formState.errors.nom_modele.message)}</p>
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
