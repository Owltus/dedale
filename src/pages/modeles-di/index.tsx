import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { FileText, Plus } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { modeleDiSchema } from "@/lib/schemas/referentiels";
import { useModelesDi, useCreateModeleDi } from "@/hooks/use-referentiels";
import { formatDate } from "@/lib/utils/format";
import type { ModeleDi } from "@/lib/types/referentiels";

function filterModeleDi(r: ModeleDi, q: string): boolean {
  return r.nom_modele.toLowerCase().includes(q) || r.libelle_constat.toLowerCase().includes(q) || false;
}

export function ModelesDiList() {
  const { data: modeles = [] } = useModelesDi();
  const createMutation = useCreateModeleDi();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(modeleDiSchema),
    defaultValues: {
      nom_modele: "",
      description: "",
      libelle_constat: "",
      description_constat: "",
      description_resolution: "",
    },
  });

  const openCreate = () => {
    form.reset({
      nom_modele: "",
      description: "",
      libelle_constat: "",
      description_constat: "",
      description_resolution: "",
    });
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
      <PageHeader title="Modèles de demandes d'intervention">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Créer un modèle" onClick={openCreate} />
        </TooltipProvider>
      </PageHeader>

      <CardList
        data={modeles}
        getKey={(r) => r.id_modele_di}
        getHref={(r) => `/modeles-di/${r.id_modele_di}`}
        filterFn={filterModeleDi}
        icon={<FileText className="size-5 text-muted-foreground" />}
        title="Modèles"
        emptyTitle="Aucun modèle"
        emptyDescription="Créez un modèle pour pré-remplir les demandes d'intervention."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.nom_modele}</p>
            <p className="text-xs text-muted-foreground truncate">
              {r.libelle_constat}
            </p>
          </div>
        )}
        renderRight={(r) => (
          <span className="text-xs text-muted-foreground shrink-0">{formatDate(r.date_creation)}</span>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau modèle de DI"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom_modele">Nom du modèle *</Label>
            <Input id="nom_modele" {...form.register("nom_modele")} />
            {form.formState.errors.nom_modele && (
              <p className="text-sm text-destructive">{String(form.formState.errors.nom_modele.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...form.register("description")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="libelle_constat">Libellé du constat *</Label>
            <Input id="libelle_constat" {...form.register("libelle_constat")} />
            {form.formState.errors.libelle_constat && (
              <p className="text-sm text-destructive">{String(form.formState.errors.libelle_constat.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description_constat">Description du constat *</Label>
            <Textarea id="description_constat" {...form.register("description_constat")} />
            {form.formState.errors.description_constat && (
              <p className="text-sm text-destructive">{String(form.formState.errors.description_constat.message)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description_resolution">Résolution suggérée</Label>
            <Textarea id="description_resolution" {...form.register("description_resolution")} />
          </div>
        </div>
      </CrudDialog>
    </div>
  );
}
