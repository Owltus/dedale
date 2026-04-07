import { useState } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Handshake, Plus } from "lucide-react";
import { CardList } from "@/components/shared/CardList";
import { ImagePicker } from "@/components/shared/ImagePicker";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prestataireSchema, type PrestataireFormData } from "@/lib/schemas/prestataires";
import { usePrestataires, useCreatePrestataire } from "@/hooks/use-prestataires";
import type { Prestataire } from "@/lib/types/prestataires";

function filterPrestataire(r: Prestataire, q: string): boolean {
  return (
    r.libelle.toLowerCase().includes(q) ||
    r.ville?.toLowerCase().includes(q) ||
    r.email?.toLowerCase().includes(q) ||
    false
  );
}

export function PrestatairesList() {
  const { data: prestataires = [] } = usePrestataires();
  const createPrestataire = useCreatePrestataire();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<PrestataireFormData>({
    resolver: typedResolver(prestataireSchema),
    defaultValues: { libelle: "", description: "", adresse: "", code_postal: "", ville: "", telephone: "", email: "", id_image: null },
  });

  const openCreate = () => {
    form.reset({ libelle: "", description: "", adresse: "", code_postal: "", ville: "", telephone: "", email: "", id_image: null });
    setDialogOpen(true);
  };

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      await createPrestataire.mutateAsync({ input: data } as never);
      toast.success("Prestataire créé");
      setDialogOpen(false);
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Prestataires">
        <TooltipProvider delay={300}>
          <HeaderButton icon={<Plus className="size-4" />} label="Ajouter un prestataire" onClick={openCreate} />
        </TooltipProvider>
      </PageHeader>

      <CardList
        data={prestataires}
        getKey={(r) => r.id_prestataire}
        getHref={(r) => `/prestataires/${r.id_prestataire}`}
        getImageId={(p) => p.id_image}
        filterFn={filterPrestataire}
        icon={<Handshake className="size-5 text-muted-foreground" />}
        title="Prestataires"
        emptyTitle="Aucun prestataire"
        emptyDescription="Créez un prestataire pour gérer vos contrats."
        renderContent={(r) => (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {r.libelle}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {[r.ville, r.telephone].filter(Boolean).join(" · ") || "\u00A0"}
            </p>
          </div>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nouveau prestataire"
        onSubmit={form.handleSubmit(onSubmit)}
        submitLabel="Créer"
      >
        <div className="flex gap-6">
          <ImagePicker value={form.watch("id_image") ?? null} onChange={(v) => form.setValue("id_image", v)} />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="libelle">Nom *</Label>
              <Input id="libelle" {...form.register("libelle")} />
              {form.formState.errors.libelle && <p className="text-sm text-destructive">{String(form.formState.errors.libelle.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...form.register("description")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input id="adresse" {...form.register("adresse")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code_postal">Code postal</Label>
                <Input id="code_postal" {...form.register("code_postal")} maxLength={5} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ville">Ville</Label>
                <Input id="ville" {...form.register("ville")} />
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
              </div>
            </div>
          </div>
        </div>
      </CrudDialog>
    </div>
  );
}
